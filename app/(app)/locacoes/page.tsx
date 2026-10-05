import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo, hojeLocal } from "@/lib/period";
import LocacoesClient from "./LocacoesClient";

// Histórico de locações realizadas (item 4 da auditoria, segunda metade).
// Tela separada da de Movimentações de propósito: lá ficam as AÇÕES (quem
// confirmou, quem cancelou, quem apagou), aqui ficam os FATOS (que
// procedimento aconteceu, quanto valeu, se foi pago). Misturar as duas foi
// justamente o que o pedido proibiu, porque servem a perguntas diferentes:
// uma responde "o que houve com este registro", a outra "quanto rodamos
// neste mês".
const TETO = 2000;
const LOTE = 100;

export default async function LocacoesPage({
  searchParams,
}: {
  searchParams: {
    period?: string;
    from?: string;
    to?: string;
    equipamento?: string;
    pagamento?: string;
    cliente?: string;
    situacao?: string;
    q?: string;
  };
}) {
  const supabase = createClient();

  const periodo = resolverPeriodo(searchParams.period ?? "mes", searchParams.from, searchParams.to);

  // Lê a tabela, e não a view rentals_contabilizaveis, porque aqui o
  // cancelamento é informação e não ruído: quem abre este histórico quer
  // ver também o que foi cancelado no período. O que a view faz por
  // dentro, esta tela faz à vista: cancelada aparece marcada e fica fora
  // dos totais.
  let consulta = supabase
    .from("rentals")
    .select(
      "id, event_date, event_date_end, shots, calculated_value, payment_method, status, pago, pago_em, rescheduled, client_id, equipment_id, clients(name), equipments(name)"
    )
    .eq("is_test", false)
    .gte("event_date", periodo.inicio)
    .lte("event_date", periodo.fim);

  if (searchParams.equipamento) consulta = consulta.eq("equipment_id", searchParams.equipamento);
  if (searchParams.pagamento) consulta = consulta.eq("payment_method", searchParams.pagamento);
  if (searchParams.cliente) consulta = consulta.eq("client_id", searchParams.cliente);

  // Situação junta os dois eixos que o banco guarda separados: o status
  // da locação e a marca de pagamento. Quem usa pensa em "a receber",
  // não em "realizada e pago igual a falso".
  switch (searchParams.situacao) {
    case "a_receber":
      // Mesmo critério da tela de Pendências: locação não cancelada e não
      // paga que já aconteceu, esteja o status como "realizada" ou ainda
      // como "confirmada" (reserva do dia que ninguém finalizou).
      consulta = consulta.neq("status", "cancelada").eq("pago", false).lt("event_date", hojeLocal());
      break;
    case "pagas":
      consulta = consulta.eq("pago", true);
      break;
    case "realizadas":
      // Realizada = já aconteceu e não foi cancelada. O status "realizada"
      // do banco quase nunca é marcado à mão, então não serve de filtro.
      consulta = consulta.neq("status", "cancelada").lt("event_date", hojeLocal());
      break;
    case "canceladas":
      consulta = consulta.eq("status", "cancelada");
      break;
  }

  const [{ data: rentals }, { data: clients }, { data: equipments }] = await Promise.all([
    consulta.order("event_date", { ascending: false }).limit(TETO),
    supabase.from("clients").select("id, name").eq("is_test", false).order("name"),
    supabase.from("equipments").select("id, name").order("code"),
  ]);

  const normalizadas = (rentals ?? []).map((r: any) => ({
    ...r,
    clients: Array.isArray(r.clients) ? (r.clients[0] ?? null) : (r.clients ?? null),
    equipments: Array.isArray(r.equipments) ? (r.equipments[0] ?? null) : (r.equipments ?? null),
  }));

  // Saldo de cada locação (valor menos pagamentos e taxa de reserva paga),
  // da mesma view que a tela de Pendências usa. Assim os dois totais de
  // "a receber" sempre batem. Em lotes para a URL da consulta não estourar.
  const saldos = new Map<string, number>();
  for (let i = 0; i < normalizadas.length; i += LOTE) {
    const ids = normalizadas.slice(i, i + LOTE).map((r: any) => r.id);
    const { data: situacoes } = await supabase
      .from("rentals_situacao_pagamento")
      .select("rental_id, saldo")
      .in("rental_id", ids);
    for (const s of situacoes ?? []) saldos.set(s.rental_id, Number(s.saldo));
  }
  const hoje = hojeLocal();
  for (const r of normalizadas as any[]) {
    r.saldo = saldos.get(r.id) ?? (r.pago ? 0 : Number(r.calculated_value));
    // Locação de vários dias só vence depois do último dia.
    r.vencida = (r.event_date_end ?? r.event_date) < hoje;
  }

  // A busca por nome é feita aqui, e não na consulta, porque o nome está
  // na tabela de clientes e o PostgREST não filtra por coluna de tabela
  // embutida sem transformar a consulta inteira. Como o período já
  // limitou o conjunto, filtrar estas linhas sai de graça.
  const termo = searchParams.q?.trim().toLowerCase();
  const porNome = termo
    ? normalizadas.filter((r: any) => (r.clients?.name ?? "").toLowerCase().includes(termo))
    : normalizadas;
  const linhas =
    searchParams.situacao === "a_receber" || searchParams.situacao === "realizadas"
      ? porNome.filter((r: any) => r.vencida)
      : porNome;

  return (
    <LocacoesClient
      linhas={linhas}
      clients={clients ?? []}
      equipments={equipments ?? []}
      periodo={periodo}
      atingiuTeto={normalizadas.length >= TETO}
    />
  );
}
