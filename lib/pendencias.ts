import type { SupabaseClient } from "@supabase/supabase-js";
import { taxaVencida } from "./taxa";
// ============================================================
// PENDÊNCIAS DE PAGAMENTO: quem está devendo e quanto
//
// Uma única função alimenta a tela de Pendências e o total do Dashboard,
// para os dois números nunca divergirem.
//
// O QUE CONTA COMO "DEVENDO"
// Locação que já aconteceu (data final anterior a hoje), não cancelada,
// fora do modo teste e com saldo em aberto. O saldo vem da view
// rentals_situacao_pagamento, que já desconta a taxa de reserva paga e os
// pagamentos parciais. Reserva futura não entra: ainda não venceu. A taxa
// de reserva pendente também fica de fora: ela tem o próprio aviso.
// ============================================================

export interface PendenciaLocacao {
  rentalId: string;
  clientId: string;
  cliente: string;
  whatsapp: string | null;
  treatment: string | null;
  displayName: string | null;
  eventDate: string;
  eventDateEnd: string | null;
  valor: number;
  credito: number;
  pago: number;
  saldo: number;
  diasAtraso: number;
}

export interface PendenciaCliente {
  clientId: string;
  cliente: string;
  whatsapp: string | null;
  treatment: string | null;
  displayName: string | null;
  total: number;
  maiorAtraso: number;
  locacoes: PendenciaLocacao[];
}

export interface Pendencias {
  locacoes: PendenciaLocacao[];
  clientes: PendenciaCliente[];
  total: number;
  maiorAtraso: number;
}

const TETO = 2000;
const LOTE = 100;

// Diferença em dias entre duas datas "YYYY-MM-DD", sem passar por fuso.
export function diasEntre(de: string, ate: string): number {
  const a = Date.parse(`${de}T12:00:00Z`);
  const b = Date.parse(`${ate}T12:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export async function buscarPendencias(supabase: SupabaseClient, hoje: string): Promise<Pendencias> {
  const { data: rentals, error: erroLocacoes } = await supabase
    .from("rentals")
    .select(
      "id, client_id, event_date, event_date_end, calculated_value, clients(name, whatsapp, treatment, display_name)"
    )
    .eq("is_test", false)
    .neq("status", "cancelada")
    .eq("pago", false)
    .lt("event_date", hoje)
    .limit(TETO);

  // Falha de consulta nunca pode virar "ninguém devendo": quem lê precisa
  // saber que a lista não carregou.
  if (erroLocacoes) throw new Error(`Não consegui carregar as pendências: ${erroLocacoes.message}`);

  // Locação de vários dias só vence depois do último dia.
  const vencidas = (rentals ?? []).filter((r: any) => (r.event_date_end ?? r.event_date) < hoje);

  const saldoPorLocacao = new Map<string, { saldo: number; credito: number; pago: number }>();
  for (let i = 0; i < vencidas.length; i += LOTE) {
    const ids = vencidas.slice(i, i + LOTE).map((r: any) => r.id);
    const { data: situacoes, error: erroSituacoes } = await supabase
      .from("rentals_situacao_pagamento")
      .select("rental_id, saldo, credito_taxa, total_pago")
      .in("rental_id", ids);
    if (erroSituacoes) throw new Error(`Não consegui carregar os saldos: ${erroSituacoes.message}`);
    for (const s of situacoes ?? []) {
      saldoPorLocacao.set(s.rental_id, {
        saldo: Number(s.saldo),
        credito: Number(s.credito_taxa),
        pago: Number(s.total_pago),
      });
    }
  }

  const locacoes: PendenciaLocacao[] = [];
  for (const r of vencidas as any[]) {
    const s = saldoPorLocacao.get(r.id);
    if (!s || s.saldo <= 0) continue;
    const c = Array.isArray(r.clients) ? r.clients[0] : r.clients;
    locacoes.push({
      rentalId: r.id,
      clientId: r.client_id,
      cliente: c?.name ?? "Sem nome",
      whatsapp: c?.whatsapp ?? null,
      treatment: c?.treatment ?? null,
      displayName: c?.display_name ?? null,
      eventDate: r.event_date,
      eventDateEnd: r.event_date_end ?? null,
      valor: Number(r.calculated_value),
      credito: s.credito,
      pago: s.pago,
      saldo: s.saldo,
      diasAtraso: diasEntre(r.event_date_end ?? r.event_date, hoje),
    });
  }

  const porCliente = new Map<string, PendenciaCliente>();
  for (const l of locacoes) {
    const atual = porCliente.get(l.clientId) ?? {
      clientId: l.clientId,
      cliente: l.cliente,
      whatsapp: l.whatsapp,
      treatment: l.treatment,
      displayName: l.displayName,
      total: 0,
      maiorAtraso: 0,
      locacoes: [],
    };
    atual.total = Math.round((atual.total + l.saldo) * 100) / 100;
    atual.maiorAtraso = Math.max(atual.maiorAtraso, l.diasAtraso);
    atual.locacoes.push(l);
    porCliente.set(l.clientId, atual);
  }
  const clientes = Array.from(porCliente.values());
  for (const c of clientes) c.locacoes.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  clientes.sort((a, b) => b.total - a.total);

  return {
    locacoes,
    clientes,
    total: Math.round(locacoes.reduce((soma, l) => soma + l.saldo, 0) * 100) / 100,
    maiorAtraso: locacoes.reduce((m, l) => Math.max(m, l.diasAtraso), 0),
  };
}

// ============================================================
// TAXAS DE RESERVA VENCIDAS
//
// Reserva de equipamento com data ainda por vir, taxa pendente e criada
// há mais dias do que settings.dias_cobranca_taxa. É a mesma regra do
// aviso vermelho do Dashboard, que agora lê desta função para o número
// do aviso e a lista da tela de Pendências nunca divergirem.
// ============================================================

export interface TaxaVencida {
  eventId: string;
  clientId: string | null;
  cliente: string;
  whatsapp: string | null;
  treatment: string | null;
  displayName: string | null;
  dataEvento: string;
  valor: number;
  diasSemPagar: number;
  // Passou do prazo de cobrança (settings.dias_cobranca_taxa).
  vencida: boolean;
}

// Todas as taxas de reserva ainda pendentes com data por vir, vencidas ou não.
// Quem deve a taxa aparece em Pendências desde o primeiro dia: o prazo só
// decide o destaque e a ordem (vencidas primeiro).
export async function buscarTaxasAReceber(
  supabase: SupabaseClient,
  hoje: string,
  diasCobrancaTaxa: number
): Promise<TaxaVencida[]> {
  const { data, error: erroConsulta } = await supabase
    .from("calendar_events")
    .select("id, client_id, date_start, taxa_valor, created_at, clients(name, whatsapp, treatment, display_name)")
    .eq("is_test", false)
    .eq("taxa_status", "pendente")
    .neq("status", "cancelada")
    .not("equipment_id", "is", null)
    .gte("date_start", hoje)
    .order("created_at", { ascending: true })
    .limit(TETO);

  if (erroConsulta) throw new Error(`Não consegui carregar as taxas: ${erroConsulta.message}`);

  const lista = (data ?? []).map((e: any) => {
    const c = Array.isArray(e.clients) ? e.clients[0] : e.clients;
    const criadoEm = new Date(new Date(e.created_at).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    return {
      eventId: e.id,
      clientId: e.client_id ?? null,
      cliente: c?.name ?? "Cliente removido",
      whatsapp: c?.whatsapp ?? null,
      treatment: c?.treatment ?? null,
      displayName: c?.display_name ?? null,
      dataEvento: e.date_start,
      valor: Number(e.taxa_valor ?? 0),
      diasSemPagar: diasEntre(criadoEm, hoje),
      vencida: taxaVencida(e.created_at, hoje, diasCobrancaTaxa),
    };
  });
  return lista.sort((a, b) => Number(b.vencida) - Number(a.vencida));
}

// ============================================================
// RESERVAS QUE JÁ PASSARAM SEM DISPAROS LANÇADOS
//
// Reserva de equipamento cuja data já passou, não cancelada e que nunca
// virou locação (ninguém lançou os disparos). É atendimento feito e ainda
// não cobrado: não aparece em Pendências nem em lugar nenhum, porque toda
// outra tela só olha de hoje em diante. Dias seguidos do mesmo cliente no
// mesmo equipamento contam como um atendimento só (a máquina ficou lá).
// ============================================================

export interface ReservaSemDisparos {
  chave: string;
  clientId: string | null;
  cliente: string;
  equipamento: string | null;
  de: string;
  ate: string;
  dias: number;
  diasDesde: number;
}

export async function buscarReservasSemDisparos(
  supabase: SupabaseClient,
  hoje: string
): Promise<ReservaSemDisparos[]> {
  const { data, error: erroConsulta } = await supabase
    .from("calendar_events")
    .select("id, client_id, equipment_id, date_start, date_end, clients(name), equipments(name)")
    .eq("is_test", false)
    .eq("status", "pre_reserva")
    .is("rental_id", null)
    .not("equipment_id", "is", null)
    .lt("date_end", hoje)
    .order("date_start", { ascending: true })
    .limit(TETO);

  if (erroConsulta) throw new Error(`Não consegui carregar as reservas sem disparos: ${erroConsulta.message}`);

  const grupos: ReservaSemDisparos[] = [];
  const ultimoPorChave = new Map<string, ReservaSemDisparos>();
  for (const e of (data ?? []) as any[]) {
    const c = Array.isArray(e.clients) ? e.clients[0] : e.clients;
    const eq = Array.isArray(e.equipments) ? e.equipments[0] : e.equipments;
    const chaveGrupo = `${e.client_id ?? "sem"}|${e.equipment_id}`;
    const anterior = ultimoPorChave.get(chaveGrupo);
    // Emenda no grupo anterior quando começa até 1 dia depois do fim dele.
    if (anterior && diasEntre(anterior.ate, e.date_start) <= 1) {
      if (e.date_end > anterior.ate) anterior.ate = e.date_end;
      anterior.dias = diasEntre(anterior.de, anterior.ate) + 1;
      anterior.diasDesde = diasEntre(anterior.ate, hoje);
      continue;
    }
    const novo: ReservaSemDisparos = {
      chave: e.id,
      clientId: e.client_id ?? null,
      cliente: c?.name ?? "Cliente removido",
      equipamento: eq?.name ?? null,
      de: e.date_start,
      ate: e.date_end,
      dias: diasEntre(e.date_start, e.date_end) + 1,
      diasDesde: diasEntre(e.date_end, hoje),
    };
    grupos.push(novo);
    ultimoPorChave.set(chaveGrupo, novo);
  }
  return grupos;
}
