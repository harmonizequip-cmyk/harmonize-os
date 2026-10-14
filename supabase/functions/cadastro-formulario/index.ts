// Função "cadastro-formulario" (Supabase Edge Function): recebe as respostas do
// formulário de cadastro (Google Forms "CADASTRO CONTOURLINE ACADEMY").
//
// Quem chama: o Apps Script da planilha de respostas, a cada envio, com
//   { "segredo": "...", "linhas": [{ "Carimbo de data/hora": "...", "NOME COMPLETO": "...", ... }], "avisar": true }
// (ou de uma vez só as respostas antigas, com "avisar": false).
// Guarda em cadastros_recebidos (a mesma resposta duas vezes é ignorada) e,
// quando é cadastro novo, avisa no celular. Nada entra em clients aqui: o dono
// confirma na tela Clientes > Cadastros recebidos.
//
// Roda como service_role. O segredo do Apps Script fica no cofre e chega por
// formulario_segredo(); a chave dos avisos, por alertas_segredos().
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = "BHKPTBT935k49O-6dnrhtF9lwBDNnKU5k45Jl20NiHFa5oxrJESXamLGBIQI6oWH3mjr8Ah2uekyQXUg2-d3UNA";
const SITE = "https://harmonize-os.vercel.app";
const MAX_LINHAS = 500;

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

/** Cabeçalho da planilha sem acento, espaço extra e caixa: "E-MAIL " vira "E-MAIL". */
function chaveColuna(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase().replace(/\s+/g, " ");
}

const COLUNAS: Record<string, string> = {
  "CARIMBO DE DATA/HORA": "carimbo",
  "NOME COMPLETO": "nome",
  "PROFISSAO": "profissao",
  "WHATSAPP": "whatsapp",
  "E-MAIL": "email",
  "EMAIL": "email",
  "NOME EMPRESA": "empresa",
  "ESTABELECIMENTO": "estabelecimento",
  "CIDADE/ESTADO": "cidade_estado",
};

function texto(v: unknown): string | null {
  const s = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
  const t = s.trim();
  return t ? t.slice(0, 300) : null;
}

/** "14/10/2026 13:20:54" (horário de Brasília) para ISO. */
function carimboIso(c: string | null): string | null {
  const m = c?.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] ?? "00"}-03:00`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  const corpo = await req.json().catch(() => null);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  const { data: segredo } = await admin.rpc("formulario_segredo");
  if (!segredo || corpo.segredo !== segredo) return json({ erro: "Não autorizado." }, 401);

  const linhas = (Array.isArray(corpo.linhas) ? corpo.linhas : []).slice(0, MAX_LINHAS);
  const registros = [];
  for (const l of linhas) {
    if (!l || typeof l !== "object") continue;
    const campos: Record<string, string | null> = {};
    const dados: Record<string, string | null> = {};
    for (const [k, v] of Object.entries(l as Record<string, unknown>)) {
      const valor = texto(v);
      dados[k.trim()] = valor;
      const destino = COLUNAS[chaveColuna(k)];
      if (destino) campos[destino] = valor;
    }
    if (!campos.nome && !campos.email && !campos.whatsapp) continue;
    registros.push({
      chave: [campos.carimbo ?? "", campos.nome ?? "", (campos.email ?? "").toLowerCase()].join("|"),
      respondido_em: carimboIso(campos.carimbo),
      nome: campos.nome,
      profissao: campos.profissao,
      whatsapp: campos.whatsapp,
      email: campos.email?.toLowerCase() ?? null,
      empresa: campos.empresa,
      estabelecimento: campos.estabelecimento,
      cidade_estado: campos.cidade_estado,
      dados,
    });
  }
  if (!registros.length) return json({ recebidos: 0, novos: 0 });

  const { data: novos, error } = await admin
    .from("cadastros_recebidos")
    .upsert(registros, { onConflict: "chave", ignoreDuplicates: true })
    .select("id, nome");
  if (error) {
    console.error("cadastros_recebidos", error.message);
    return json({ erro: "Não consegui guardar o cadastro." }, 500);
  }

  // Aviso no celular só para cadastro que chegou agora (não na carga das antigas).
  let enviados = 0;
  if (corpo.avisar !== false && (novos ?? []).length) {
    const { data: seg } = await admin.rpc("alertas_segredos").single();
    if (seg?.vapid_private) {
      webpush.setVapidDetails(SITE, VAPID_PUBLIC, seg.vapid_private);
      const { data: inscricoes } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth");
      const nomes = (novos ?? []).map((n: any) => n.nome ?? "sem nome");
      const aviso = {
        title: nomes.length === 1 ? `Cadastro novo: ${nomes[0]}` : `${nomes.length} cadastros novos`,
        body: "Preencheu o formulário da Academy. Toque para conferir e confirmar no Harmonize.",
        url: "/clientes/cadastros",
        tag: "cadastro-formulario",
        actions: [{ action: "ver", title: "Conferir cadastro", url: "/clientes/cadastros" }],
      };
      for (const i of inscricoes ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
            JSON.stringify(aviso),
            { TTL: 60 * 60 * 24 }
          );
          enviados++;
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_inscricoes").delete().eq("id", i.id);
        }
      }
    }
  }

  return json({ recebidos: registros.length, novos: (novos ?? []).length, avisos: enviados });
});
