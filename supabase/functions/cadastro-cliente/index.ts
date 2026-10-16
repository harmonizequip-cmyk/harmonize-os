// Função "cadastro-cliente" (Supabase Edge Function, sem login): o formulário
// que a cliente preenche sozinha em /cadastro/<token> para ganhar acesso ao
// Planejador.
//
//   GET  ?token=...                      -> o link vale? + o que já se sabe dela
//   POST { token, dados: {...}, senha }  -> cria o login dela e atualiza/cria o cadastro
//
// O token (convites_cadastro, uso único, 14 dias) é a única chave: sem ele nada
// acontece. O login nasce sem acesso nenhum; quem libera é o dono, na ficha da
// cliente (liberar_acesso_planejador). Avisa o dono no celular.
// Roda como service_role; a chave dos avisos vem de alertas_segredos().
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = "BHKPTBT935k49O-6dnrhtF9lwBDNnKU5k45Jl20NiHFa5oxrJESXamLGBIQI6oWH3mjr8Ah2uekyQXUg2-d3UNA";
const SITE = "https://harmonize-os.vercel.app";
const CORS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// Mesma regra do Auth (lib/senha.ts): 8+ caracteres, minúscula, maiúscula e número.
function problemaSenha(s: string): string | null {
  if (s.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-z]/.test(s)) return "A senha precisa ter pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(s)) return "A senha precisa ter pelo menos uma letra maiúscula.";
  if (!/\d/.test(s)) return "A senha precisa ter pelo menos um número.";
  return null;
}

const CAMPOS = ["nome_completo", "tratamento", "nome_exibicao", "whatsapp", "email", "documento", "clinica", "endereco", "cidade", "uf"];

async function avisar(nome: string, clientId: string, novo: boolean) {
  const { data: seg } = await admin.rpc("alertas_segredos").single();
  if (!(seg as any)?.vapid_private) return;
  webpush.setVapidDetails(SITE, VAPID_PUBLIC, (seg as any).vapid_private);
  const { data: inscricoes } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth");
  const url = `/clientes/${clientId}`;
  const aviso = {
    title: `📋 ${nome} preencheu o cadastro`,
    body: `${novo ? "Cadastro novo criado" : "Cadastro atualizado"}. Toque para liberar o acesso ao Planejador.`,
    url,
    tag: `cadastro-cliente-${clientId}`,
    actions: [{ action: "ver", title: "Liberar acesso", url }],
  };
  for (const i of inscricoes ?? []) {
    try {
      await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, JSON.stringify(aviso), { TTL: 86400 });
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_inscricoes").delete().eq("id", i.id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (req.method === "GET") {
    const token = new URL(req.url).searchParams.get("token") ?? "";
    if (!/^[0-9a-f]{64}$/.test(token)) return json({ valido: false, motivo: "Link inválido." });
    const { data, error } = await admin.rpc("convite_cadastro_abrir", { p_token: token });
    if (error) return json({ valido: false, motivo: "Não consegui abrir o cadastro agora. Tente de novo." }, 500);
    return json(data);
  }
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);

  const corpo = await req.json().catch(() => null);
  const token = String(corpo?.token ?? "");
  const senha = String(corpo?.senha ?? "");
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ erro: "Link inválido." }, 400);
  const dados: Record<string, string> = {};
  for (const k of CAMPOS) {
    const v = corpo?.dados?.[k];
    if (v != null && String(v).trim()) dados[k] = String(v).trim().slice(0, 200);
  }
  const email = (dados.email ?? "").toLowerCase();
  if (!dados.nome_completo || !dados.whatsapp || !/^\S+@\S+\.\S+$/.test(email)) {
    return json({ erro: "Preencha nome completo, WhatsApp e um e-mail válido." }, 400);
  }
  const ruim = problemaSenha(senha);
  if (ruim) return json({ erro: ruim }, 400);

  const { data: aberto } = await admin.rpc("convite_cadastro_abrir", { p_token: token });
  if (!(aberto as any)?.valido) return json({ erro: (aberto as any)?.motivo ?? "Link inválido." }, 400);

  // Login dela (sem acesso até o dono liberar). E-mail que já tem login: não troca a senha.
  let criado: string | null = null;
  let jaTinha = false;
  const { data: novoUser, error: erroUser } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (erroUser) {
    if (!/already|registered|exists/i.test(erroUser.message)) {
      console.error("createUser", erroUser.message);
      return json({ erro: "Não consegui criar o login. Confira o e-mail e tente de novo." }, 400);
    }
    jaTinha = true;
  } else {
    criado = novoUser.user?.id ?? null;
  }

  const { data: res, error } = await admin.rpc("convite_cadastro_receber", { p_token: token, p_dados: dados, p_email_login: email });
  if (error) {
    if (criado) await admin.auth.admin.deleteUser(criado);
    return json({ erro: error.message || "Não consegui salvar o cadastro." }, 400);
  }
  const r = res as { client_id: string; nome: string; tratamento: string | null; novo: boolean };
  try {
    await avisar([r.tratamento, r.nome].filter(Boolean).join(" "), r.client_id, r.novo);
  } catch (e) {
    console.error("aviso", (e as Error).message);
  }
  return json({ ok: true, ja_tinha_login: jaTinha });
});
