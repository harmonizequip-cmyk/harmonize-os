// Função "alertas" (Supabase Edge Function): manda os avisos do Harmonize
// para os celulares inscritos (web push).
//
// Quem chama:
//   - o relógio do banco (pg_cron), com o cabeçalho x-alerta-segredo:
//       { "tipo": "resumo" }  7h30, resumo do dia
//       { "tipo": "vespera" } 18h, reservas de amanhã (só envia se houver)
//   - o botão "Enviar aviso de teste" em Configurações, com o login de quem
//     está no app: { "tipo": "teste" } manda só para os aparelhos dessa pessoa.
//
// Roda como service_role (lê o banco sem RLS). Os segredos ficam no cofre do
// banco e chegam pela função alertas_segredos(), que só service_role executa.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const VAPID_PUBLIC = "BHKPTBT935k49O-6dnrhtF9lwBDNnKU5k45Jl20NiHFa5oxrJESXamLGBIQI6oWH3mjr8Ah2uekyQXUg2-d3UNA";
const SITE = "https://harmonize-os.vercel.app";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const reais = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const umDe = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const EQUIP: Record<string, string> = { hipro_1: "HIPRO 1", hipro_2: "HIPRO 2" };

function somarDias(iso: string, dias: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// O botão de teste chama do navegador (outro endereço), então a resposta
// precisa liberar o app a ler o resultado.
const CORS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function reservasDoDia(dia: string) {
  const { data } = await admin
    .from("calendar_events")
    .select("event_type, date_start, date_end, clients(name, city)")
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .eq("is_test", false)
    .lte("date_start", dia)
    .gte("date_end", dia)
    .order("event_type");
  return (data ?? []).map((e: any) => {
    const c = umDe<any>(e.clients);
    return `${EQUIP[e.event_type] ?? e.event_type}: ${c?.name ?? "sem cliente"}${c?.city ? " (" + c.city + ")" : ""}`;
  });
}

async function montarResumo(hoje: string) {
  const reservas = await reservasDoDia(hoje);

  const { data: situacoes } = await admin.from("rentals_situacao_pagamento").select("rental_id, saldo").gt("saldo", 0);
  const ids = (situacoes ?? []).map((s: any) => s.rental_id);
  let aReceber = 0;
  const clientes = new Set<string>();
  if (ids.length) {
    const { data: locacoes } = await admin
      .from("rentals_contabilizaveis")
      .select("id, client_id, event_date, event_date_end")
      .in("id", ids);
    const saldo = new Map((situacoes ?? []).map((s: any) => [s.rental_id, Number(s.saldo)]));
    for (const r of locacoes ?? []) {
      if ((r.event_date_end ?? r.event_date) < hoje) {
        aReceber += saldo.get(r.id) ?? 0;
        if (r.client_id) clientes.add(r.client_id);
      }
    }
  }

  const { count: atrasadas } = await admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente")
    .eq("is_test", false)
    .lt("due_date", hoje);

  const linhas = [
    reservas.length ? `Hoje: ${reservas.join("; ")}` : "Hoje: nenhuma reserva",
    aReceber > 0 ? `A receber vencido: ${reais(aReceber)} (${clientes.size} ${clientes.size === 1 ? "cliente" : "clientes"})` : "Ninguém devendo",
    (atrasadas ?? 0) > 0 ? `${atrasadas} ${atrasadas === 1 ? "tarefa atrasada" : "tarefas atrasadas"}` : "Tarefas em dia",
  ];
  return { title: "Harmonize · seu dia", body: linhas.join("\n"), url: "/dashboard", tag: "resumo" };
}

async function montarVespera(hoje: string) {
  const amanha = somarDias(hoje, 1);
  const reservas = await reservasDoDia(amanha);
  if (!reservas.length) return null;
  return {
    title: `Amanhã: ${reservas.length} ${reservas.length === 1 ? "reserva" : "reservas"}`,
    body: reservas.join("\n") + "\nSepare o equipamento e confirme o endereço.",
    url: "/agenda",
    tag: "vespera",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  const corpo = await req.json().catch(() => ({}));
  const tipo = String(corpo?.tipo ?? "");

  const { data: seg, error: erroSeg } = await admin.rpc("alertas_segredos").single();
  if (erroSeg || !seg?.vapid_private || !seg?.segredo) return json({ erro: "Segredos dos avisos não configurados." }, 500);
  webpush.setVapidDetails(SITE, VAPID_PUBLIC, seg.vapid_private);

  // Teste: só com o login de quem está no app, e só para os aparelhos dele.
  let somenteUsuario: string | null = null;
  if (tipo === "teste") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem?.user) return json({ erro: "Entre no app para enviar o teste." }, 401);
    somenteUsuario = quem.user.id;
  } else if (req.headers.get("x-alerta-segredo") !== seg.segredo) {
    return json({ erro: "Não autorizado." }, 401);
  }

  const { data: hojeData } = await admin.rpc("hoje_local");
  const hoje = String(hojeData);

  let aviso: { title: string; body: string; url: string; tag: string } | null = null;
  if (tipo === "teste") aviso = { title: "Harmonize", body: "Avisos ligados neste aparelho. Toque para abrir o app.", url: "/dashboard", tag: "teste" };
  else if (tipo === "resumo") aviso = await montarResumo(hoje);
  else if (tipo === "vespera") aviso = await montarVespera(hoje);
  else return json({ erro: "Tipo de aviso desconhecido." }, 400);

  if (!aviso) return json({ enviados: 0, motivo: "nada para avisar" });

  let consulta = admin.from("push_inscricoes").select("id, endpoint, p256dh, auth");
  if (somenteUsuario) consulta = consulta.eq("user_id", somenteUsuario);
  const { data: inscricoes } = await consulta;

  let enviados = 0;
  let removidos = 0;
  const falhas: string[] = [];
  for (const i of inscricoes ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        JSON.stringify(aviso),
        { TTL: 60 * 60 * 6 }
      );
      enviados++;
      await admin.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).eq("id", i.id);
    } catch (e: any) {
      // 404/410: o navegador não reconhece mais este aparelho (desinstalou, limpou dados).
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await admin.from("push_inscricoes").delete().eq("id", i.id);
        removidos++;
      } else {
        falhas.push(String(e?.statusCode ?? e?.message ?? e));
      }
    }
  }
  return json({ tipo, enviados, removidos, falhas, aparelhos: (inscricoes ?? []).length, aviso });
});
