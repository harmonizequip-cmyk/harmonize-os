import { createClient } from "@/lib/supabase/server";
import { hojeLocal, resolverPeriodo } from "@/lib/period";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: {
    period?: string;
    from?: string;
    to?: string;
    cidade?: string;
    situacao?: string;
    q?: string;
  };
}) {
  const supabase = createClient();

  // AQUI O PERÍODO NÃO ESCONDE CLIENTE, ELE MEDE.
  // Cadastro é estado, não atividade: sumir com quem não alugou neste
  // mês seria desfazer na tela o que acabamos de consertar no dado, que
  // é "uma vez cliente, sempre cliente". Então o período decide o que as
  // colunas Locações e Total contam, e a lista continua inteira. Quem
  // quiser só quem rodou no recorte escolhe isso na situação.
  const periodo = resolverPeriodo(searchParams.period ?? "ano", searchParams.from, searchParams.to);

  // Antes esta consulta filtrava stage = 'cliente', e era isso que fazia
  // um cliente SUMIR daqui ao ser movido para "Agendamento" no funil. O
  // campo stage diz onde a pessoa está na negociação atual, não se ela
  // já comprou: quem alugou uma vez continua cliente para sempre, e a
  // posição no funil da próxima venda não desfaz a venda passada.
  //
  // Agora a lista pergunta o fato em vez da etapa, e o fato é ter
  // locação. Quem foi cadastrado direto como cliente também entra, para
  // o cadastro novo não ficar invisível até a primeira locação.
  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, clinic_name, whatsapp, city, address, data_evento, stage")
    .eq("is_test", false)
    .order("name");

  // Lê da view rentals_contabilizaveis, não da tabela rentals. A view já
  // exclui cancelada e modo teste, que era o filtro que esta tela não
  // tinha: locação cancelada entrava no total faturado de cada cliente.
  const { data: rentals } = await supabase
    .from("rentals_contabilizaveis")
    .select("client_id, calculated_value, event_date")
    .gte("event_date", periodo.inicio)
    .lte("event_date", periodo.fim);

  // A contagem de sempre vem separada, para a lista poder mostrar quem
  // já foi cliente mesmo quando o período escolhido não tem nada dele.
  const { data: rentalsDeSempre } = await supabase
    .from("rentals_contabilizaveis")
    .select("client_id");
  const jaAlugou = new Set((rentalsDeSempre ?? []).map((r: any) => r.client_id));

  // hojeLocal em vez de toISOString: o segundo devolve a data em UTC, e
  // à noite fazia o "próximo evento" pular o dia seguinte.
  const todayStr = hojeLocal();
  const { data: upcomingEvents } = await supabase
    .from("calendar_events")
    .select("client_id, date_start, confirmed")
    .neq("status", "cancelada")
    .not("client_id", "is", null)
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true });

  const statsByClient = new Map<string, { count: number; total: number; lastDate: string | null }>();
  for (const r of rentals ?? []) {
    const current = statsByClient.get(r.client_id) ?? { count: 0, total: 0, lastDate: null };
    current.count += 1;
    current.total += Number(r.calculated_value);
    if (!current.lastDate || r.event_date > current.lastDate) current.lastDate = r.event_date;
    statsByClient.set(r.client_id, current);
  }

  // Primeiro evento futuro de cada cliente (a lista já vem ordenada por data)
  const nextEventByClient = new Map<string, { date_start: string; confirmed: boolean }>();
  for (const e of upcomingEvents ?? []) {
    if (!nextEventByClient.has(e.client_id)) {
      nextEventByClient.set(e.client_id, { date_start: e.date_start, confirmed: e.confirmed });
    }
  }

  // A taxa vem dos agendamentos, não do cliente: quem reserva cinco
  // datas deve cinco taxas, e o campo antigo guardava uma só.
  const { data: taxas } = await supabase
    .from("clientes_taxas")
    .select("client_id, taxas_pendentes, taxas_pagas, valor_pendente");
  const taxaPorCliente = new Map((taxas ?? []).map((t: any) => [t.client_id, t]));

  const cidades = Array.from(
    new Set((clients ?? []).map((c: any) => c.city).filter(Boolean) as string[])
  ).sort();

  const termo = searchParams.q?.trim().toLowerCase();

  const clientsWithStats = (clients ?? [])
    .filter((c: any) => c.stage === "cliente" || jaAlugou.has(c.id))
    .map((c: any) => {
    const t: any = taxaPorCliente.get(c.id);
    return {
      ...c,
      stats: statsByClient.get(c.id) ?? { count: 0, total: 0, lastDate: null },
      nextEvent: nextEventByClient.get(c.id) ?? null,
      taxasPendentes: Number(t?.taxas_pendentes ?? 0),
      taxasPagas: Number(t?.taxas_pagas ?? 0),
      valorPendente: Number(t?.valor_pendente ?? 0),
    };
  })
    .filter((c: any) => {
      if (searchParams.cidade && c.city !== searchParams.cidade) return false;
      if (termo) {
        const alvo = `${c.name} ${c.clinic_name ?? ""} ${c.city ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      switch (searchParams.situacao) {
        case "no_periodo":
          return c.stats.count > 0;
        case "taxa_pendente":
          return c.taxasPendentes > 0;
        case "com_agendamento":
          return c.nextEvent !== null;
        case "sem_locacao":
          return !jaAlugou.has(c.id);
        default:
          return true;
      }
    });

  return (
    <ClientesClient
      initialClients={clientsWithStats}
      cidades={cidades}
      periodo={periodo}
    />
  );
}
