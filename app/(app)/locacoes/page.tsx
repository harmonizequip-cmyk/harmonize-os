import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/period";
import LocacoesClient from "./LocacoesClient";

// Histórico de locações realizadas (item 4 da auditoria, segunda metade).
// Tela separada da de Movimentações de propósito: lá ficam as AÇÕES (quem
// confirmou, quem cancelou, quem apagou), aqui ficam os FATOS (que
// procedimento aconteceu, quanto valeu, se foi pago). Misturar as duas foi
// justamente o que o pedido proibiu, porque servem a perguntas diferentes:
// uma responde "o que houve com este registro", a outra "quanto rodamos
// neste mês".
const TETO = 2000;

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
      "id, event_date, shots, calculated_value, payment_method, status, pago, pago_em, rescheduled, client_id, equipment_id, clients(name), equipments(name)"
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
      consulta = consulta.eq("status", "realizada").eq("pago", false);
      break;
    case "pagas":
      consulta = consulta.eq("pago", true);
      break;
    case "realizadas":
      consulta = consulta.eq("status", "realizada");
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

  // A busca por nome é feita aqui, e não na consulta, porque o nome está
  // na tabela de clientes e o PostgREST não filtra por coluna de tabela
  // embutida sem transformar a consulta inteira. Como o período já
  // limitou o conjunto, filtrar estas linhas sai de graça.
  const termo = searchParams.q?.trim().toLowerCase();
  const linhas = termo
    ? normalizadas.filter((r: any) => (r.clients?.name ?? "").toLowerCase().includes(termo))
    : normalizadas;

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
