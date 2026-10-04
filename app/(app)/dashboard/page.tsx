import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod, hojeLocal, somarDias, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/period";
import { formatCurrency } from "@/lib/format";
import { fetchSettings } from "@/lib/settings";
import { buscarPendencias, buscarTaxasVencidas } from "@/lib/pendencias";
import PeriodFilter from "@/components/PeriodFilter";
import DashboardCharts from "@/components/DashboardCharts";
import OpportunityRadar from "@/components/OpportunityRadar";

// Meta mensal de locações: 25 a 30 é a faixa de meta; acima de 30 é a meta
// máxima. Ficam aqui, juntas, para mudar num lugar só.
const META_MIN = 25;
const META_MAX = 30;

function formatWeekdayDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const s = format(d, "EEE, dd 'de' MMM", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const supabase = createClient();
  const { from, to } = resolvePeriod(searchParams.period, searchParams.from, searchParams.to);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  const todayStr = hojeLocal();
  // Âncora ao meio-dia UTC do "hoje" de Brasília: somar dias daqui nunca
  // escorrega de dia (Date.now() em UTC errava depois das 21h).
  const hojeAncora = new Date(`${todayStr}T12:00:00Z`).getTime();
  const somaDias = (n: number) => new Date(hojeAncora + n * 86400000);

  // O Dashboard é tela de decisão, então registro de teste não entra em
  // nenhum número. Onde a consulta lê de uma view _contabilizaveis, esse
  // filtro já vem de dentro dela junto com a exclusão de locação
  // cancelada, e por isso o .eq("is_test", false) não aparece; onde lê a
  // tabela crua, o filtro continua explícito na consulta.
  // Lançamentos do período filtrado, para os cards de Entradas/Saídas/Resultado e os gráficos
  const { data: transactions } = await supabase
    .from("transactions_contabilizaveis")
    .select("id, type, amount, date, category_id, categories(name)")
    .eq("scope", "harmonize")
    .gte("date", fromStr)
    .lte("date", toStr);

  // Todos os lançamentos históricos, para o Saldo acumulado (não depende do filtro de período)
  const { data: allTimeTransactions } = await supabase
    .from("transactions_contabilizaveis")
    .select("type, amount")
    .eq("scope", "harmonize");

  // Contagem de locações do período, sem cancelada nem teste (as canceladas
  // têm card próprio). Serve ao card "Locações" e de divisor do ticket médio.
  const { count: billableRentalsCount } = await supabase
    .from("rentals_contabilizaveis")
    .select("id", { count: "exact", head: true })
    .gte("event_date", fromStr)
    .lte("event_date", toStr);

  // Concluídas: evento no passado (antes de hoje) e não cancelado — não
  // depende do status estar manualmente marcado como "realizada", porque
  // na prática esse campo raramente é atualizado depois que a data passa.
  // Reagendadas: soma rentals.rescheduled (locações já formalizadas) com
  // calendar_events.rescheduled de reservas que ainda não viraram rental
  // (rental_id nulo) — a mesma lacuna corrigida no modal do Funil.
  // Conta pela data em que o reagendamento ACONTECEU (rescheduled_at),
  // não pela data para onde o evento foi. rescheduled_at tem hora, então
  // o recorte cobre o dia inteiro no fuso de Brasília: comparar com
  // `to` direto (meia-noite UTC) deixava de fora quase todo o último dia
  // do período, e um período de um dia só ("hoje") contava zero.
  const reagendadoDesde = `${fromStr}T00:00:00-03:00`;
  const reagendadoAte = `${toStr}T23:59:59.999-03:00`;
  const [{ count: concluidasCount }, { count: canceladasCount }, rescheduledRentalsRes, rescheduledEventsRes] =
    await Promise.all([
      supabase
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .neq("status", "cancelada")
        .eq("is_test", false)
        .lt("event_date", todayStr)
        .gte("event_date", fromStr)
        .lte("event_date", toStr),
      supabase
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .eq("status", "cancelada")
        .eq("is_test", false)
        .gte("event_date", fromStr)
        .lte("event_date", toStr),
      supabase
        .from("rentals")
        .select("id", { count: "exact", head: true })
        .eq("rescheduled", true)
        .eq("is_test", false)
        .gte("rescheduled_at", reagendadoDesde)
        .lte("rescheduled_at", reagendadoAte),
      supabase
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("rescheduled", true)
        .eq("is_test", false)
        .is("rental_id", null)
        .gte("rescheduled_at", reagendadoDesde)
        .lte("rescheduled_at", reagendadoAte),
    ]);

  const reagendadasCount = (rescheduledRentalsRes.count ?? 0) + (rescheduledEventsRes.count ?? 0);

  // Resumo por equipamento (HIPRO 1 / HIPRO 2), no mesmo período filtrado
  // acima — antes só existia na tela separada de Equipamentos; junto no
  // Dashboard porque é a primeira coisa que se quer ver ao abrir o app.
  const { data: equipments } = await supabase.from("equipments").select("id, code, name").order("code");
  // Receita por equipamento sai da view: os contadores acima ficam na
  // tabela rentals de propósito, porque contar cancelada é justamente o
  // objetivo de um deles, mas somar dinheiro de cancelada não é.
  const { data: equipmentRentals } = await supabase
    .from("rentals_contabilizaveis")
    .select("id, equipment_id, calculated_value")
    .gte("event_date", fromStr)
    .lte("event_date", toStr);

  // Saldo em aberto por locação, para calcular o pendente de cada
  // equipamento sem precisar duplicar a lógica de pagamento parcial que já
  // vive na view rentals_situacao_pagamento.
  const rentalIds = (equipmentRentals ?? []).map((r) => r.id);
  const { data: situacoes } = rentalIds.length
    ? await supabase
        .from("rentals_situacao_pagamento")
        .select("rental_id, saldo")
        .in("rental_id", rentalIds)
    : { data: [] as { rental_id: string; saldo: number }[] };

  const saldoByRentalId = new Map((situacoes ?? []).map((s) => [s.rental_id, Number(s.saldo)]));

  // Ocupação por equipamento: dias com agendamento (locação ou pré-reserva
  // não cancelada) sobre dias disponíveis. Disponível = segunda a sábado,
  // a mesma regra do radar (domingo não é dia útil), mais os domingos que
  // tiveram agendamento, para a conta nunca passar de 100%. Com o filtro
  // em um dia só ("hoje"), um percentual de um dia não diz nada, então o
  // recorte vira o mês corrente.
  // Meta do mês: sempre o mês corrente, independente do filtro de período.
  const mesInicio = primeiroDiaDoMes(todayStr);
  const mesFim = ultimoDiaDoMes(todayStr);
  const [{ count: locacoesMesCount }, { count: preReservasMesCount }] = await Promise.all([
    supabase
      .from("rentals_contabilizaveis")
      .select("id", { count: "exact", head: true })
      .gte("event_date", mesInicio)
      .lte("event_date", mesFim),
    supabase
      .from("calendar_events")
      .select("id", { count: "exact", head: true })
      .eq("is_test", false)
      .eq("status", "pre_reserva")
      .is("rental_id", null)
      .gte("date_start", mesInicio)
      .lte("date_start", mesFim),
  ]);
  const locMes = locacoesMesCount ?? 0;
  const preMes = preReservasMesCount ?? 0;
  const metaStatus =
    locMes > META_MAX
      ? { texto: "Acima da meta máxima", cor: "text-brand-teal" }
      : locMes >= META_MIN
        ? { texto: "Dentro da meta", cor: "text-brand-teal" }
        : { texto: `Faltam ${META_MIN - locMes} para a meta`, cor: "text-amber-600 dark:text-amber-400" };
  const metaEscala = Math.max(META_MAX + 5, locMes + preMes);

  // Reservas de HIPRO com a taxa pendente além do prazo de cobrança
  // (settings.dias_cobranca_taxa) e data ainda por vir. Só aviso, sempre
  // sobre o presente, independente do filtro de período.
  const { diasCobrancaTaxa } = await fetchSettings(supabase);
  const taxasVencidas = await buscarTaxasVencidas(supabase, todayStr, diasCobrancaTaxa);
  const taxasVencidasCount = taxasVencidas.length;

  // Quem está devendo: total geral de hoje, independente do filtro de
  // período (dívida é estado atual, não movimento do período). Mesma conta
  // da tela de Pendências.
  const pendencias = await buscarPendencias(supabase, todayStr);

  // Devedores cuja locação já passou e ainda não foi marcada como realizada.
  // Só entram quem ainda deve: locação paga e não finalizada não é pendência.
  const naoFinalizadasCount = pendencias.locacoes.filter((l) => !l.finalizada).length;

  const umDiaSo = fromStr === toStr;
  const ocupInicio = umDiaSo ? primeiroDiaDoMes(todayStr) : fromStr;
  const ocupFim = umDiaSo ? ultimoDiaDoMes(todayStr) : toStr;
  const { data: eventosOcupacao } = await supabase
    .from("calendar_events")
    .select("equipment_id, date_start, date_end")
    .eq("is_test", false)
    .neq("status", "cancelada")
    .not("equipment_id", "is", null)
    .lte("date_start", ocupFim)
    .gte("date_end", ocupInicio);

  const diasDoRecorte: string[] = [];
  for (let d = ocupInicio; d <= ocupFim && diasDoRecorte.length < 400; d = somarDias(d, 1)) diasDoRecorte.push(d);
  const ehDomingo = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay() === 0;

  const ocupadosPorEquip = new Map<string, Set<string>>();
  for (const ev of eventosOcupacao ?? []) {
    const set = ocupadosPorEquip.get(ev.equipment_id as string) ?? new Set<string>();
    const ini = (ev.date_start as string) < ocupInicio ? ocupInicio : (ev.date_start as string);
    const fim = (ev.date_end as string) > ocupFim ? ocupFim : (ev.date_end as string);
    for (let d = ini; d <= fim && set.size < 400; d = somarDias(d, 1)) set.add(d);
    ocupadosPorEquip.set(ev.equipment_id as string, set);
  }
  const ocupacaoDe = (equipmentId: string) => {
    const ocupados = ocupadosPorEquip.get(equipmentId) ?? new Set<string>();
    const disponiveis = diasDoRecorte.filter((d) => !ehDomingo(d) || ocupados.has(d)).length;
    return { ocupados: ocupados.size, disponiveis, pct: disponiveis > 0 ? ocupados.size / disponiveis : 0 };
  };
  const rotuloOcupacao = umDiaSo
    ? "no mês corrente"
    : `de ${ocupInicio.split("-").reverse().join("/")} a ${ocupFim.split("-").reverse().join("/")}`;

  const in7Str = somaDias(7).toISOString().slice(0, 10);
  const { count: pendingConfirmations } = await supabase
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("confirmed", false)
    .eq("is_test", false)
    .neq("status", "cancelada")
    .gte("date_start", todayStr)
    .lte("date_start", in7Str);

  // Próximas locações (prévia no Dashboard) — eventos de HIPRO 1/2 a partir
  // de hoje, pra dar um resumo rápido da agenda sem precisar abrir a tela
  // de Agenda. Busca um pouco mais que 7 pra poder agrupar corretamente
  // quando os dois HIPROs caem no mesmo dia.
  const { data: upcomingRaw } = await supabase
    .from("calendar_events")
    .select("id, event_type, date_start, confirmed, client_id, clients(name)")
    .eq("is_test", false)
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true })
    .limit(14);

  const normalizedUpcoming = (upcomingRaw ?? []).map((e: any) => ({
    ...e,
    clients: Array.isArray(e.clients) ? (e.clients[0] ?? null) : (e.clients ?? null),
  }));

  const upcomingByDate = new Map<string, typeof normalizedUpcoming>();
  for (const e of normalizedUpcoming) {
    const list = upcomingByDate.get(e.date_start) ?? [];
    list.push(e);
    upcomingByDate.set(e.date_start, list);
  }
  const upcomingGroups: { date: string; events: typeof normalizedUpcoming }[] = [];
  let countedLocacoes = 0;
  for (const [date, events] of upcomingByDate) {
    if (countedLocacoes >= 7) break;
    upcomingGroups.push({ date, events });
    countedLocacoes += events.length;
  }

  // Radar de oportunidades: cruza dias com os 2 HIPROs livres nos próximos
  // 30 dias com leads que esfriaram (Nutrição/Interesse, sem data travada).
  // Equipamento parado é receita parada, e ninguém para pra somar isso com
  // "quem eu já deveria ter reativado" — o radar faz essa conta sozinho.
  const radarHorizonDays = 30;
  const radarEndStr = somaDias(radarHorizonDays).toISOString().slice(0, 10);
  const { data: radarEvents } = await supabase
    .from("calendar_events")
    .select("date_start, client_id, clients(city)")
    .eq("is_test", false)
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .gt("date_start", todayStr)
    .lte("date_start", radarEndStr);

  const normalizedRadarEvents = (radarEvents ?? []).map((e: any) => ({
    date_start: e.date_start as string,
    city: (Array.isArray(e.clients) ? e.clients[0]?.city : e.clients?.city) ?? null,
  }));
  const busyDaysSet = new Set(normalizedRadarEvents.map((e) => e.date_start));
  const citiesInRoute = Array.from(
    new Set(normalizedRadarEvents.map((e) => e.city).filter((c): c is string => !!c))
  );

  const freeDays: string[] = [];
  for (let i = 1; i <= radarHorizonDays; i++) {
    const dateObj = somaDias(i);
    if (dateObj.getUTCDay() === 0) continue; // domingo nunca entra como dia livre sugerido
    const d = dateObj.toISOString().slice(0, 10);
    if (!busyDaysSet.has(d)) freeDays.push(d);
  }

  const { data: dormantLeads } = await supabase
    .from("clients")
    .select("id, name, city, whatsapp, stage")
    .eq("is_test", false)
    .in("stage", ["nutricao", "qualificado"])
    .order("name");

  const rows = transactions ?? [];
  const normalizedRows = rows.map((t: any) => ({
    ...t,
    categories: Array.isArray(t.categories) ? (t.categories[0] ?? null) : (t.categories ?? null),
  }));
  const entradas = rows.filter((t) => t.type === "entrada").reduce((sum, t) => sum + Number(t.amount), 0);
  const saidas = rows.filter((t) => t.type === "saida").reduce((sum, t) => sum + Number(t.amount), 0);
  const resultado = entradas - saidas;

  const saldoTotal = (allTimeTransactions ?? []).reduce(
    (sum, t) => sum + (t.type === "entrada" ? Number(t.amount) : -Number(t.amount)),
    0
  );

  // Ticket médio = valor das locações do período dividido pelo número de
  // locações contabilizáveis (sem cancelada nem teste). Antes dividia todas
  // as entradas de caixa (taxa de reserva, mentoria, ajuda de custo,
  // recebimento de locações de outros períodos), o que inflava o número.
  const valorLocacoesPeriodo = (equipmentRentals ?? []).reduce((sum, r) => sum + Number(r.calculated_value), 0);
  const ticketMedio = billableRentalsCount && billableRentalsCount > 0 ? valorLocacoesPeriodo / billableRentalsCount : 0;

  const cards = [
    { label: "Saldo", value: saldoTotal },
    { label: "Entradas", value: entradas },
    { label: "Saídas", value: saidas },
    { label: "Resultado", value: resultado },
  ];

  const EQUIPMENT_COLORS: Record<string, string> = {
    hipro_1: "bg-brand-teal",
    hipro_2: "bg-brand-blue",
  };
  const equipmentSummary = (equipments ?? []).map((eq) => {
    const eqRentals = (equipmentRentals ?? []).filter((r) => r.equipment_id === eq.id);
    return {
      ...eq,
      locacoes: eqRentals.length,
      receita: eqRentals.reduce((sum, r) => sum + Number(r.calculated_value), 0),
      pendente: eqRentals.reduce((sum, r) => sum + (saldoByRentalId.get(r.id) ?? 0), 0),
      ocupacao: ocupacaoDe(eq.id),
    };
  });

  // Query string do período atual, repassada para a página de detalhe do
  // equipamento, para que ela mantenha o mesmo filtro de datas do Dashboard.
  const ocupacaoGeral = equipmentSummary.reduce(
    (acc, eq) => ({ ocupados: acc.ocupados + eq.ocupacao.ocupados, disponiveis: acc.disponiveis + eq.ocupacao.disponiveis }),
    { ocupados: 0, disponiveis: 0 }
  );
  const ocupacaoGeralPct = ocupacaoGeral.disponiveis > 0 ? ocupacaoGeral.ocupados / ocupacaoGeral.disponiveis : 0;

  const periodQuery = new URLSearchParams({ from: fromStr, to: toStr }).toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Dashboard</h1>
        <PeriodFilter />
      </div>

      {!!pendingConfirmations && pendingConfirmations > 0 && (
        <Link
          href="/agenda"
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400"
        >
          ⚠️ {pendingConfirmations} {pendingConfirmations === 1 ? "evento precisa" : "eventos precisam"} de confirmação nos próximos 7 dias →
        </Link>
      )}

      {naoFinalizadasCount > 0 && (
        <Link
          href="/pendencias"
          className="block rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400"
        >
          🏁 {naoFinalizadasCount} {naoFinalizadasCount === 1 ? "locação com valor em aberto ainda não foi finalizada" : "locações com valor em aberto ainda não foram finalizadas"}: marque como realizada na Agenda →
        </Link>
      )}

      {!!taxasVencidasCount && taxasVencidasCount > 0 && (
        <Link
          href="/pendencias#taxas"
          className="block rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400"
        >
          💳 {taxasVencidasCount} {taxasVencidasCount === 1 ? "reserva está" : "reservas estão"} com a taxa vencida (mais de{" "}
          {diasCobrancaTaxa} dias sem pagar) →
        </Link>
      )}

      <Link
        href="/pendencias"
        className="flex items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal dark:border-neutral-800/60 dark:bg-neutral-900/55"
      >
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">A receber (pendências)</p>
          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(pendencias.total)}</p>
        </div>
        <p className="text-right text-xs text-neutral-500 dark:text-neutral-400">
          {pendencias.clientes.length === 0
            ? "Ninguém devendo"
            : `${pendencias.clientes.length} ${pendencias.clientes.length === 1 ? "cliente devendo" : "clientes devendo"} · mais antigo há ${pendencias.maiorAtraso} ${pendencias.maiorAtraso === 1 ? "dia" : "dias"}`}{" "}
          →
        </p>
      </Link>

      <OpportunityRadar freeDays={freeDays} citiesInRoute={citiesInRoute} leads={dormantLeads ?? []} />

      <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Meta do mês: {META_MIN} a {META_MAX} locações (máxima: acima de {META_MAX})
          </p>
          <p className={`text-xs font-semibold ${metaStatus.cor}`}>{metaStatus.texto}</p>
        </div>
        <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {locMes} {locMes === 1 ? "locação" : "locações"} no mês
          {preMes > 0 && (
            <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
              + {preMes} {preMes === 1 ? "pré-reserva" : "pré-reservas"} ainda sem disparos
            </span>
          )}
        </p>
        <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div
            className="absolute inset-y-0 left-0 bg-brand-teal"
            style={{ width: `${Math.min(100, (locMes / metaEscala) * 100)}%` }}
          />
          <div
            className="absolute inset-y-0 bg-brand-blue/50"
            style={{
              left: `${Math.min(100, (locMes / metaEscala) * 100)}%`,
              width: `${Math.max(0, Math.min(100, ((locMes + preMes) / metaEscala) * 100) - Math.min(100, (locMes / metaEscala) * 100))}%`,
            }}
          />
          <div className="absolute inset-y-0 w-px bg-neutral-500" style={{ left: `${(META_MIN / metaEscala) * 100}%` }} />
          <div className="absolute inset-y-0 w-px bg-neutral-500" style={{ left: `${(META_MAX / metaEscala) * 100}%` }} />
        </div>
        <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
          Traços na barra: {META_MIN} e {META_MAX}. A parte azul são pré-reservas do mês que ainda podem virar locação.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{card.label}</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(card.value)}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{billableRentalsCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(ticketMedio)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Concluídas</p>
          <p className="mt-1 text-lg font-semibold text-brand-teal">{concluidasCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Canceladas</p>
          <p className="mt-1 text-lg font-semibold text-brand-pink">{canceladasCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Reagendadas</p>
          <p className="mt-1 text-lg font-semibold text-brand-blue">{reagendadasCount}</p>
        </div>
      </div>

      {equipmentSummary.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Equipamentos</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Ocupação geral {rotuloOcupacao}:{" "}
              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                {Math.round(ocupacaoGeralPct * 100)}%
              </span>{" "}
              ({ocupacaoGeral.ocupados} de {ocupacaoGeral.disponiveis} dias-máquina)
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {equipmentSummary.map((eq) => (
              <Link
                key={eq.id}
                href={`/dashboard/equipamentos/${eq.id}?${periodQuery}`}
                className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl transition hover:border-brand-teal/40 hover:bg-white/90 dark:border-neutral-800/60 dark:bg-neutral-900/55 dark:hover:bg-neutral-900/75"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${EQUIPMENT_COLORS[eq.code] ?? "bg-neutral-400"}`} />
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{eq.name}</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-brand-teal">{formatCurrency(eq.receita)}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {eq.locacoes} {eq.locacoes === 1 ? "locação" : "locações"} no período
                </p>
                <div className="mt-2">
                  <div className="flex items-baseline justify-between text-xs text-neutral-500 dark:text-neutral-400">
                    <span>Ocupação</span>
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {Math.round(eq.ocupacao.pct * 100)}% · {eq.ocupacao.ocupados} de {eq.ocupacao.disponiveis} dias
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-brand-teal"
                      style={{ width: `${Math.min(100, Math.round(eq.ocupacao.pct * 100))}%` }}
                    />
                  </div>
                </div>
                {eq.pendente > 0 && (
                  <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Pendente: {formatCurrency(eq.pendente)}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {upcomingGroups.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">Próximas locações</p>
            <Link href="/agenda" className="text-xs text-brand-teal underline underline-offset-2">
              Ver agenda →
            </Link>
          </div>
          <div className="space-y-2">
            {upcomingGroups.map(({ date, events }) => {
              const bothHipros = events.length > 1;
              return (
                <div
                  key={date}
                  className={`rounded-2xl border p-3 shadow-sm backdrop-blur-xl ${
                    bothHipros
                      ? "border-brand-pink/50 bg-brand-pink/5 dark:border-brand-pink/40 dark:bg-brand-pink/10"
                      : "border-white/60 bg-white/70 dark:border-neutral-800/60 dark:bg-neutral-900/55"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                      {formatWeekdayDate(date)}
                    </p>
                    {bothHipros && (
                      <span className="rounded-full bg-brand-pink/15 px-2 py-0.5 text-[10px] font-medium text-brand-pink-dark dark:text-brand-pink">
                        2 HIPROs no mesmo dia
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {events.map((e) => (
                      <div key={e.id} className="flex items-center gap-2 text-sm">
                        <span
                          className={`h-2 w-2 flex-shrink-0 rounded-full ${
                            e.event_type === "hipro_1" ? "bg-brand-teal" : "bg-brand-blue"
                          }`}
                        />
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {e.event_type === "hipro_1" ? "HIPRO 1" : "HIPRO 2"}
                        </span>
                        {e.clients?.name && (
                          <span className="text-neutral-500 dark:text-neutral-400">· {e.clients.name}</span>
                        )}
                        {!e.confirmed && (
                          <span className="ml-auto whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            não confirmado
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <DashboardCharts transactions={normalizedRows} />
    </div>
  );
}
