// Função "alertas" (Supabase Edge Function): manda os avisos do Harmonize
// para os celulares inscritos (web push).
//
// Quem chama:
//   - o relógio do banco (pg_cron), com o cabeçalho x-alerta-segredo:
//       { "tipo": "resumo" }  7h30, resumo do dia
//       { "tipo": "vespera" } 18h, reservas de amanhã (só envia se houver) e
//                             um aviso por cliente ainda sem pedido de confirmação
//       { "tipo": "domingo" } domingo 19h, fechamento da semana e lembrete do backup
//   - o botão "Enviar aviso de teste" em Configurações, com o login de quem
//     está no app: { "tipo": "teste" } manda só para os aparelhos dessa pessoa.
//
// Roda como service_role (lê o banco sem RLS). Os segredos ficam no cofre do
// banco e chegam pela função alertas_segredos(), que só service_role executa.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";
import { dataBr, linkWhatsApp, mensagemCobranca, mensagemTaxa, reais } from "./mensagens.ts";

const VAPID_PUBLIC = "BHKPTBT935k49O-6dnrhtF9lwBDNnKU5k45Jl20NiHFa5oxrJESXamLGBIQI6oWH3mjr8Ah2uekyQXUg2-d3UNA";
const SITE = "https://harmonize-os.vercel.app";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

interface Aviso {
  title: string;
  body: string;
  url: string;
  tag: string;
  // Até 2 botões no próprio aviso (ex: "Cobrar no WhatsApp", "Ver pendências").
  actions?: { action: string; title: string; url: string }[];
}

const umDe = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const EQUIP: Record<string, string> = { hipro_1: "HIPRO 1", hipro_2: "HIPRO 2" };

function diasEntre(de: string, ate: string): number {
  return Math.round((new Date(ate + "T12:00:00Z").getTime() - new Date(de + "T12:00:00Z").getTime()) / 86400000);
}

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

async function montarResumo(hoje: string): Promise<Aviso> {
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
  return {
    title: "Harmonize · seu dia",
    body: linhas.join("\n"),
    url: "/dashboard",
    tag: "resumo",
    actions: [
      { action: "ver", title: "Ver pendências", url: "/pendencias" },
      // Com tarefa atrasada, o segundo botão abre a fila nas Tarefas.
      ...((atrasadas ?? 0) > 0 ? [{ action: "fila", title: "Atacar tarefas", url: "/tarefas?fila=1" }] : []),
    ],
  } as Aviso;
}

// Uma por cliente de amanhã que ainda não recebeu o pedido de confirmação.
// O botão abre a Agenda com a mensagem pronta; é lá que o envio fica
// registrado (registrar_pedido_confirmacao), como no botão da própria Agenda.
const MAX_CONFIRMACOES = 4;

async function confirmacoesDeAmanha(hoje: string): Promise<Aviso[]> {
  const amanha = somarDias(hoje, 1);
  const { data } = await admin
    .from("calendar_events")
    .select("id, event_type, clients(name, city)")
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .eq("is_test", false)
    .eq("confirmed", false)
    .is("confirmation_message_sent_at", null)
    .not("client_id", "is", null)
    .eq("date_start", amanha)
    .order("event_type")
    .limit(MAX_CONFIRMACOES);
  return (data ?? []).map((e: any) => {
    const c = umDe<any>(e.clients);
    const url = `/agenda?confirmar=${e.id}`;
    return {
      title: `Confirmar com ${c?.name ?? "a cliente"}`,
      body: `${EQUIP[e.event_type] ?? e.event_type} amanhã${c?.city ? " em " + c.city : ""}. Toque para mandar a mensagem de confirmação.`,
      url,
      tag: `confirmar-${e.id}`,
      actions: [{ action: "confirmar", title: "Mandar confirmação", url }],
    };
  });
}

// Dia livre (os dois HIPROs sem nada, fora domingo, mesma regra da imagem de
// datas disponíveis) nos próximos 7 dias. Só às segundas e quintas, para não
// virar ruído: quase toda semana tem dia livre.
const DIAS_DO_AVISO_LIVRE = [1, 4];
const NOMES_DIA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

async function avisoDiasLivres(hoje: string): Promise<Aviso | null> {
  if (!DIAS_DO_AVISO_LIVRE.includes(new Date(hoje + "T12:00:00Z").getUTCDay())) return null;
  const inicio = somarDias(hoje, 1);
  const fim = somarDias(hoje, 7);
  const { data } = await admin
    .from("calendar_events")
    .select("date_start, date_end")
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .eq("is_test", false)
    .lte("date_start", fim)
    .gte("date_end", inicio);
  const ocupados = new Set<string>();
  for (const e of data ?? []) {
    for (let d = e.date_start; d <= e.date_end; d = somarDias(d, 1)) ocupados.add(d);
  }
  const livres: string[] = [];
  for (let d = inicio; d <= fim; d = somarDias(d, 1)) {
    if (new Date(d + "T12:00:00Z").getUTCDay() !== 0 && !ocupados.has(d)) livres.push(d);
  }
  if (!livres.length) return null;
  const nomes = livres.map((d) => `${NOMES_DIA[new Date(d + "T12:00:00Z").getUTCDay()]} ${dataBr(d).slice(0, 5)}`);
  return {
    title: livres.length === 1 ? `Dia livre: ${nomes[0]}` : `${livres.length} dias livres nos próximos 7 dias`,
    body: (livres.length === 1 ? "Os dois HIPROs estão livres." : nomes.join(", ") + ".") + " Mande as datas para os leads.",
    url: "/agenda?acao=datas",
    tag: "dias-livres",
    actions: [{ action: "datas", title: "Gerar imagem das datas", url: "/agenda?acao=datas" }],
  };
}

// Domingo à noite: o que aconteceu de segunda a domingo, comparado com a
// semana anterior, e quanto falta para as contas fixas do mês.
async function montarSemana(hoje: string): Promise<Aviso> {
  const ini = somarDias(hoje, -6);
  const iniAnt = somarDias(hoje, -13);
  const fimAnt = somarDias(hoje, -7);

  const faturado = async (de: string, ate: string) => {
    const { data } = await admin
      .from("rentals_contabilizaveis")
      .select("calculated_value")
      .gte("event_date", de)
      .lte("event_date", ate);
    return { total: (data ?? []).reduce((s: number, r: any) => s + Number(r.calculated_value ?? 0), 0), qtd: (data ?? []).length };
  };
  // Recebido = pagamentos de locação + taxas de reserva pagas na semana (fica de
  // fora o que não é de cliente, como devolução de empréstimo).
  const recebido = async (de: string, ate: string) => {
    const { data: pags } = await admin
      .from("rental_payments")
      .select("valor, rentals!inner(is_test, status)")
      .eq("rentals.is_test", false)
      .neq("rentals.status", "cancelada")
      .gte("data", de)
      .lte("data", ate);
    const { data: taxas } = await admin
      .from("calendar_events")
      .select("transactions!calendar_events_taxa_transaction_id_fkey!inner(amount, date)")
      .eq("is_test", false)
      .eq("taxa_status", "paga")
      .gte("transactions.date", de)
      .lte("transactions.date", ate);
    const somaPags = (pags ?? []).reduce((s: number, p: any) => s + Number(p.valor ?? 0), 0);
    const somaTaxas = (taxas ?? []).reduce((s: number, e: any) => s + Number(umDe<any>(e.transactions)?.amount ?? 0), 0);
    return somaPags + somaTaxas;
  };

  const [sem, ant, rec] = await Promise.all([faturado(ini, hoje), faturado(iniAnt, fimAnt), recebido(ini, hoje)]);

  const { data: situacoes } = await admin.from("rentals_situacao_pagamento").select("rental_id, saldo").gt("saldo", 0);
  let aReceber = 0;
  const ids = (situacoes ?? []).map((x: any) => x.rental_id);
  if (ids.length) {
    const { data: locs } = await admin.from("rentals_contabilizaveis").select("id, event_date, event_date_end").in("id", ids);
    const saldo = new Map((situacoes ?? []).map((x: any) => [x.rental_id, Number(x.saldo)]));
    for (const r of locs ?? []) if ((r.event_date_end ?? r.event_date) <= hoje) aReceber += saldo.get(r.id) ?? 0;
  }

  // Contas fixas do mês (Configurações) contra a sobra das locações do mês,
  // a mesma conta do quadro "Este mês" do Dashboard.
  const { data: cfg } = await admin.from("settings").select("despesas_fixas").eq("id", true).maybeSingle();
  const fixas = (Array.isArray(cfg?.despesas_fixas) ? cfg!.despesas_fixas : []).reduce(
    (s: number, d: any) => s + (Number(d?.valor) > 0 ? Number(d.valor) : 0),
    0
  );
  let linhaFixas: string | null = null;
  if (fixas > 0) {
    const { data: lucros } = await admin
      .from("rentals_lucro")
      .select("lucro_liquido")
      .gte("event_date", hoje.slice(0, 8) + "01")
      .lte("event_date", hoje);
    const sobra = (lucros ?? []).reduce((s: number, l: any) => s + Number(l.lucro_liquido ?? 0), 0);
    linhaFixas = sobra >= fixas ? `Contas fixas do mês cobertas (sobra ${reais(sobra - fixas)})` : `Faltam ${reais(fixas - sobra)} para as contas fixas do mês`;
  }

  const variacao =
    ant.total > 0
      ? ` (${sem.total >= ant.total ? "+" : ""}${Math.round(((sem.total - ant.total) / ant.total) * 100)}% sobre a semana anterior)`
      : "";
  const linhas = [
    `Faturado: ${reais(sem.total)} em ${sem.qtd} ${sem.qtd === 1 ? "locação" : "locações"}${variacao}`,
    `Recebido: ${reais(rec)}`,
    aReceber > 0 ? `A receber: ${reais(aReceber)}` : "Ninguém devendo",
    ...(linhaFixas ? [linhaFixas] : []),
  ];
  return {
    title: "Fechamento da semana",
    body: linhas.join("\n"),
    url: "/dashboard",
    tag: "semana",
    actions: [{ action: "ver", title: "Ver pendências", url: "/pendencias" }],
  };
}

const AVISO_BACKUP: Aviso = {
  title: "Hora do backup da semana",
  body: "Toque, gere o arquivo e escolha Google Drive para guardar.",
  url: "/configuracoes?acao=backup",
  tag: "backup",
  actions: [{ action: "backup", title: "Fazer backup", url: "/configuracoes?acao=backup" }],
};

async function montarVespera(hoje: string): Promise<Aviso | null> {
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


// Avisos por acontecimento, enviados junto com o resumo das 7h30. Cada um é um
// aviso separado, com a tela certa (e o WhatsApp da cliente, quando é cobrança).
const DIAS_DE_COBRANCA = [3, 7, 15];
const MAX_AVISOS_EXTRAS = 6;

async function avisosDoDia(hoje: string): Promise<Aviso[]> {
  const avisos: Aviso[] = [];

  // 1. Locação de vários dias que termina hoje: buscar o equipamento.
  const { data: fins } = await admin
    .from("calendar_events")
    .select("id, event_type, date_start, date_end, clients(name, city)")
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .eq("is_test", false)
    .eq("date_end", hoje)
    .lt("date_start", hoje);
  for (const e of fins ?? []) {
    const c = umDe<any>((e as any).clients);
    avisos.push({
      title: `Buscar o ${EQUIP[(e as any).event_type] ?? "equipamento"} hoje`,
      body: `Último dia da locação de ${c?.name ?? "cliente"}${c?.city ? " (" + c.city + ")" : ""}, iniciada em ${dataBr((e as any).date_start)}.`,
      url: "/agenda",
      tag: `fim-${(e as any).id}`,
    });
  }

  // 2. Cobrança: cliente com locação vencida há 3, 7 ou 15 dias.
  const { data: situacoes } = await admin.from("rentals_situacao_pagamento").select("rental_id, saldo").gt("saldo", 0);
  const saldo = new Map((situacoes ?? []).map((s: any) => [s.rental_id, Number(s.saldo)]));
  if (saldo.size) {
    const { data: locacoes } = await admin
      .from("rentals_contabilizaveis")
      .select("id, client_id, event_date, event_date_end")
      .in("id", Array.from(saldo.keys()));
    const porCliente = new Map<string, { data: string; saldo: number; dias: number }[]>();
    for (const r of locacoes ?? []) {
      const fim = r.event_date_end ?? r.event_date;
      if (!r.client_id || fim >= hoje) continue;
      const lista = porCliente.get(r.client_id) ?? [];
      lista.push({ data: r.event_date, saldo: saldo.get(r.id) ?? 0, dias: diasEntre(fim, hoje) });
      porCliente.set(r.client_id, lista);
    }
    const devedores = Array.from(porCliente.entries()).filter(([, l]) => l.some((x) => DIAS_DE_COBRANCA.includes(x.dias)));
    if (devedores.length) {
      const { data: clientes } = await admin
        .from("clients")
        .select("id, name, whatsapp, treatment, display_name")
        .in("id", devedores.map(([id]) => id));
      const cli = new Map((clientes ?? []).map((c: any) => [c.id, c]));
      for (const [id, lista] of devedores) {
        const c = cli.get(id) ?? { name: "Cliente" };
        const total = lista.reduce((s, l) => s + l.saldo, 0);
        const maisAntigo = Math.max(...lista.map((l) => l.dias));
        const whats = linkWhatsApp(c.whatsapp, mensagemCobranca(c, lista));
        avisos.push({
          title: `Cobrar ${c.name}: ${reais(total)}`,
          body: `Pagamento vencido há ${maisAntigo} ${maisAntigo === 1 ? "dia" : "dias"}.`,
          url: "/pendencias",
          tag: `cobranca-${id}`,
          actions: [
            ...(whats ? [{ action: "whatsapp", title: "Cobrar no WhatsApp", url: whats }] : []),
            { action: "ver", title: "Ver pendências", url: "/pendencias" },
          ],
        });
      }
    }
  }

  // 3. Taxa de reserva que venceu hoje (prazo de Configurações, contado da criação da reserva).
  const { data: cfg } = await admin.from("settings").select("dias_cobranca_taxa").eq("id", true).single();
  const prazo = Number(cfg?.dias_cobranca_taxa ?? 3);
  const { data: taxas } = await admin
    .from("calendar_events")
    .select("id, date_start, taxa_valor, created_at, clients(name, whatsapp, treatment, display_name)")
    .eq("is_test", false)
    .eq("taxa_status", "pendente")
    .neq("status", "cancelada")
    .not("equipment_id", "is", null)
    .gte("date_start", hoje);
  for (const t of taxas ?? []) {
    const criada = new Date(new Date((t as any).created_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    if (somarDias(criada, prazo) !== hoje) continue;
    const c = umDe<any>((t as any).clients) ?? { name: "Cliente" };
    const valor = Number((t as any).taxa_valor ?? 0);
    const whats = linkWhatsApp(c.whatsapp, mensagemTaxa(c, (t as any).date_start, valor));
    avisos.push({
      title: `Taxa de reserva venceu: ${c.name}`,
      body: `Reserva de ${dataBr((t as any).date_start)}${valor > 0 ? ", " + reais(valor) : ""}. Ainda não paga.`,
      url: "/pendencias#taxas",
      tag: `taxa-${(t as any).id}`,
      actions: [
        ...(whats ? [{ action: "whatsapp", title: "Cobrar no WhatsApp", url: whats }] : []),
        { action: "ver", title: "Ver pendências", url: "/pendencias#taxas" },
      ],
    });
  }

  // 4. Equipamento com volta da manutenção prevista para hoje.
  const { data: manut } = await admin
    .from("equipments")
    .select("id, name")
    .eq("status", "manutencao")
    .eq("status_previsto_fim", hoje);
  for (const m of manut ?? []) {
    avisos.push({
      title: `${(m as any).name} volta da manutenção hoje`,
      body: "Confira se ele já está pronto para as próximas reservas.",
      url: "/equipamentos",
      tag: `manutencao-${(m as any).id}`,
    });
  }

  return avisos.slice(0, MAX_AVISOS_EXTRAS);
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

  let avisos: Aviso[] = [];
  if (tipo === "teste") {
    avisos = [{
      title: "Harmonize",
      body: "Avisos ligados neste aparelho. Toque para abrir o app.",
      url: "/dashboard",
      tag: "teste",
      actions: [{ action: "ver", title: "Ver pendências", url: "/pendencias" }],
    }];
  } else if (tipo === "resumo") {
    const livres = await avisoDiasLivres(hoje);
    avisos = [await montarResumo(hoje), ...(await avisosDoDia(hoje)), ...(livres ? [livres] : [])];
  } else if (tipo === "vespera") {
    const v = await montarVespera(hoje);
    avisos = v ? [v, ...(await confirmacoesDeAmanha(hoje))] : [];
  } else if (tipo === "domingo") {
    avisos = [await montarSemana(hoje), AVISO_BACKUP];
  } else return json({ erro: "Tipo de aviso desconhecido." }, 400);

  if (!avisos.length) return json({ enviados: 0, motivo: "nada para avisar" });

  let consulta = admin.from("push_inscricoes").select("id, endpoint, p256dh, auth");
  if (somenteUsuario) consulta = consulta.eq("user_id", somenteUsuario);
  const { data: inscricoes } = await consulta;

  let enviados = 0;
  let removidos = 0;
  const falhas: string[] = [];
  for (const i of inscricoes ?? []) {
    let morto = false;
    for (const aviso of avisos) {
      try {
        await webpush.sendNotification(
          { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
          JSON.stringify(aviso),
          { TTL: 60 * 60 * 6 }
        );
        enviados++;
      } catch (e: any) {
        // 404/410: o navegador não reconhece mais este aparelho (desinstalou, limpou dados).
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await admin.from("push_inscricoes").delete().eq("id", i.id);
          removidos++;
          morto = true;
          break;
        }
        falhas.push(String(e?.statusCode ?? e?.message ?? e));
      }
    }
    if (!morto) await admin.from("push_inscricoes").update({ ultimo_envio: new Date().toISOString() }).eq("id", i.id);
  }
  return json({ tipo, enviados, removidos, falhas, aparelhos: (inscricoes ?? []).length, avisos: avisos.map((a) => a.title) });
});
