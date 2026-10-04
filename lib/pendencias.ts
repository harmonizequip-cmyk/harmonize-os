import type { SupabaseClient } from "@supabase/supabase-js";
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
  const { data: rentals } = await supabase
    .from("rentals")
    .select(
      "id, client_id, event_date, event_date_end, calculated_value, clients(name, whatsapp, treatment, display_name)"
    )
    .eq("is_test", false)
    .neq("status", "cancelada")
    .eq("pago", false)
    .lt("event_date", hoje)
    .limit(TETO);

  // Locação de vários dias só vence depois do último dia.
  const vencidas = (rentals ?? []).filter((r: any) => (r.event_date_end ?? r.event_date) < hoje);

  const saldoPorLocacao = new Map<string, { saldo: number; credito: number; pago: number }>();
  for (let i = 0; i < vencidas.length; i += LOTE) {
    const ids = vencidas.slice(i, i + LOTE).map((r: any) => r.id);
    const { data: situacoes } = await supabase
      .from("rentals_situacao_pagamento")
      .select("rental_id, saldo, credito_taxa, total_pago")
      .in("rental_id", ids);
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
