import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod, resolverPeriodo, hojeLocal, somarDias, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/period";
import { formatCurrency } from "@/lib/format";
import { fetchSettings } from "@/lib/settings";
import { buscarPendencias, buscarTaxasAReceber, buscarReservasSemDisparos } from "@/lib/pendencias";
import PeriodFilter from "@/components/PeriodFilter";
import DashboardCharts from "@/components/DashboardCharts";
import OpportunityRadar from "@/components/OpportunityRadar";
import MesCard from "@/components/dashboard/MesCard";
import PrecisaDeVoce, { type AvisoDash } from "@/components/dashboard/PrecisaDeVoce";
import PrevisaoCaixaCard from "@/components/PrevisaoCaixaCard";
import { preverCaixa, type ReservaFutura, type LocacaoPassada } from "@/lib/previsao";
import { calcularMetaDoMes } from "@/lib/meta-mes";
import { ehCategoriaDeEmprestimo } from "@/lib/emprestimos";
import { foraDoResultadoPorCartao, foraDoSaldo } from "@/lib/cartao";
import { buscarTodas } from "@/lib/buscar-todas";
import { diasDoPeriodo } from "@/lib/period";
import { situacaoAplicador } from "@/lib/aplicador";
import { situacaoRevisao } from "@/lib/revisao";
import { LinkCliente } from "@/components/Atalhos";
import { linkDiaAgenda, linkEvento } from "@/lib/atalhos";
import { CalendarDays, HandCoins, Wallet } from "lucide-react";
import { IconeChip } from "@/components/ui/Visual";
import { carregarRelacionamento } from "@/lib/carregar-relacionamento";
import { LIMITE_DIARIO } from "@/lib/relacionamento";

// Meta mensal de locações: 25 a 30 é a faixa de meta; acima de 30 é a meta
// máxima. Ficam aqui, juntas, para mudar num lugar só.
const META_MIN = 25;
const META_MAX = 30;

function formatWeekdayDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const s = format(d, "EEE, dd 'de' MMM", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DashboardPage(
  props: {
    searchParams: Promise<{ period?: string; from?: string; to?: string }>;
  }
) {
  const recebidos = await props.searchParams;
  // O Dashboard abre no mês (pedido do dono, 17/10/2026); "Hoje" fica no filtro.
  const searchParams = { ...recebidos, period: recebidos.period ?? (recebidos.from ? "personalizado" : "mes") };
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
  // Lançamentos do período filtrado, para os gráficos (resultado, fluxo e categorias).
  // Em páginas (o Supabase devolve no máximo 1000 linhas) e com erro visível: soma pela
  // metade seria pior que a tela de erro.
  const transactions = await buscarTodas((de, ate) =>
    supabase
      .from("transactions_contabilizaveis")
      .select("id, type, amount, date, category_id, cartao_mov, categories(name)")
      .eq("scope", "harmonize")
      .gte("date", fromStr)
      .lte("date", toStr)
      .order("id")
      .range(de, ate)
  );

  // Todos os lançamentos históricos, para o Saldo acumulado (não depende do filtro de período)
  const allTimeTransactions = await buscarTodas((de, ate) =>
    supabase
      .from("transactions_contabilizaveis")
      .select("type, amount, cartao_mov, payment_method")
      .eq("scope", "harmonize")
      .order("id")
      .range(de, ate)
  );

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
  const { data: valoresMes } = await supabase
    .from("rentals_contabilizaveis")
    .select("calculated_value")
    .gte("event_date", mesInicio)
    .lte("event_date", mesFim);
  const faturamentoMes = (valoresMes ?? []).reduce((soma, r: any) => soma + Number(r.calculated_value ?? 0), 0);

  // Reservas de HIPRO com a taxa ainda pendente e data por vir; as que
  // passaram do prazo de cobrança (settings.dias_cobranca_taxa) ficam em
  // destaque. Só aviso, sempre sobre o presente, independente do filtro de
  // período. A baixa é feita em Pendências, no mesmo lugar do aviso.
  const { diasCobrancaTaxa, despesasFixas: todasFixas } = await fetchSettings(supabase);
  // Contas fixas pessoais ficam no Financeiro pessoal; aqui só as do negócio.
  const despesasFixas = todasFixas.filter((f) => f.tipo === "negocio");

  // Quadro "Este mês": sobra (lucro) das locações do mês contra as contas
  // fixas de Configurações. Só locações que contam como faturamento
  // (rentals_contabilizaveis); o lucro de cada uma vem de rentals_lucro.
  // A média por locação usa os últimos 90 dias, para estimar quantas faltam.
  let metaDoMes = null as ReturnType<typeof calcularMetaDoMes> | null;
  if (despesasFixas.length > 0) {
    const noventaDiasAtras = somarDias(todayStr, -90);
    const [{ data: contabilizaveis }, { count: reservasRestantes }] = await Promise.all([
      supabase
        .from("rentals_contabilizaveis")
        .select("id, event_date")
        .gte("event_date", noventaDiasAtras < mesInicio ? noventaDiasAtras : mesInicio)
        .lte("event_date", mesFim),
      supabase
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("is_test", false)
        .neq("status", "cancelada")
        .is("rental_id", null)
        .in("event_type", ["hipro_1", "hipro_2"])
        .gte("date_start", todayStr)
        .lte("date_start", mesFim),
    ]);
    const ids = (contabilizaveis ?? []).map((r: any) => r.id as string);
    const lucroPorId = new Map<string, number>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data: lucros } = await supabase
        .from("rentals_lucro")
        .select("rental_id, lucro_liquido")
        .in("rental_id", ids.slice(i, i + 100));
      for (const l of lucros ?? []) lucroPorId.set(l.rental_id, Number(l.lucro_liquido));
    }
    let sobraDoMes = 0;
    let locacoesDoMes = 0;
    let somaRecentes = 0;
    let qtdRecentes = 0;
    for (const r of contabilizaveis ?? []) {
      const lucro = lucroPorId.get(r.id) ?? 0;
      if (r.event_date >= mesInicio && r.event_date <= mesFim) {
        sobraDoMes += lucro;
        locacoesDoMes += 1;
      }
      if (r.event_date >= noventaDiasAtras && r.event_date <= todayStr) {
        somaRecentes += lucro;
        qtdRecentes += 1;
      }
    }
    metaDoMes = calcularMetaDoMes({
      despesas: despesasFixas,
      sobraDoMes,
      locacoesDoMes,
      sobraMediaPorLocacao: qtdRecentes > 0 ? somaRecentes / qtdRecentes : null,
      reservasRestantes: reservasRestantes ?? 0,
    });
  }
  const rotuloMesAtual = new Date(`${todayStr}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const taxasAReceber = await buscarTaxasAReceber(supabase, todayStr, diasCobrancaTaxa);
  const taxasAReceberCount = taxasAReceber.length;
  const taxasVencidasCount = taxasAReceber.filter((t) => t.vencida).length;
  const taxasAReceberTotal = taxasAReceber.reduce((s, t) => s + t.valor, 0);

  // Quem está devendo: total geral de hoje, independente do filtro de
  // período (dívida é estado atual, não movimento do período). Mesma conta
  // da tela de Pendências.
  const pendencias = await buscarPendencias(supabase, todayStr);

  // Previsão de caixa (30 e 60 dias): reservas marcadas, estimadas pela média
  // das locações passadas, mais o que está vencido, menos custos e contas fixas.
  const fim60 = somarDias(todayStr, 60);
  const [{ data: reservasFuturasRaw }, { data: lucrosRaw }, { data: mentoriasRaw }] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("id, date_start, client_id, event_type, is_mentoria, taxa_status, taxa_valor, clients(name)")
      .eq("is_test", false)
      .neq("status", "cancelada")
      .is("rental_id", null)
      .in("event_type", ["hipro_1", "hipro_2", "mentoria"])
      .gte("date_start", todayStr)
      .lte("date_start", fim60),
    supabase.from("rentals_lucro").select("rental_id, client_id, calculated_value, total_despesas"),
    supabase.from("calendar_events").select("rental_id").eq("is_mentoria", true).not("rental_id", "is", null),
  ]);
  const idsMentoria = new Set((mentoriasRaw ?? []).map((m: any) => m.rental_id as string));
  const historicoCaixa: LocacaoPassada[] = (lucrosRaw ?? []).map((l: any) => ({
    clienteId: l.client_id,
    valor: Number(l.calculated_value ?? 0),
    despesas: Number(l.total_despesas ?? 0),
    mentoria: idsMentoria.has(l.rental_id),
  }));
  const reservasFuturas: ReservaFutura[] = (reservasFuturasRaw ?? []).map((e: any) => ({
    id: e.id,
    data: e.date_start,
    clienteId: e.client_id,
    clienteNome: (Array.isArray(e.clients) ? e.clients[0]?.name : e.clients?.name) ?? null,
    equipamento: e.event_type === "hipro_1" ? "HIPRO 1" : e.event_type === "hipro_2" ? "HIPRO 2" : "Mentoria",
    mentoria: !!e.is_mentoria || e.event_type === "mentoria",
    taxaPaga: e.taxa_status === "paga" ? Number(e.taxa_valor ?? 0) : 0,
  }));
  const fixasMensais = despesasFixas.reduce((s, f) => s + (f.valor > 0 ? f.valor : 0), 0);
  // Faturas de cartão da Harmonize ainda não pagas (vencidas também contam).
  const { data: faturasRaw, error: erroFaturas } = await supabase
    .from("faturas_cartao")
    .select("vencimento, total_compras, total_pago")
    .eq("scope", "harmonize")
    .lte("vencimento", fim60);
  // Sem as faturas a previsão sairia maior do que é.
  if (erroFaturas) throw new Error(`Não consegui carregar as faturas do cartão: ${erroFaturas.message}`);
  const faturasAbertas = ((faturasRaw ?? []) as any[])
    .map((f) => ({ vencimento: f.vencimento as string, valor: Math.round((Number(f.total_compras) - Number(f.total_pago)) * 100) / 100 }))
    .filter((f) => f.valor > 0.009);
  const baseCaixa = { hoje: todayStr, reservas: reservasFuturas, historico: historicoCaixa, aReceberVencido: pendencias.total, fixasMensais, faturas: faturasAbertas };
  const previsao30 = preverCaixa({ ...baseCaixa, dias: 30, fim: somarDias(todayStr, 30) });
  const previsao60 = preverCaixa({ ...baseCaixa, dias: 60, fim: fim60 });

  // Reservas que já passaram sem disparos lançados: atendimento feito e
  // ainda não cobrado, invisível em qualquer outra tela.
  const semDisparos = await buscarReservasSemDisparos(supabase, todayStr);

  // Aplicadores com a garantia acabando (90% a 100%). Quem já passou da
  // garantia não avisa: continua funcionando e o aviso ficaria para sempre.
  // Se a view ainda não existir, nada aparece.
  const { data: aplicadoresUso } = await supabase
    .from("aplicadores_uso")
    .select("nome, disparos, garantia_disparos")
    .eq("ativo", true)
    .not("garantia_disparos", "is", null);
  const aplicadoresAlerta = (aplicadoresUso ?? [])
    .map((a) => ({ nome: a.nome as string, ...situacaoAplicador({ disparos: Number(a.disparos), garantia_disparos: Number(a.garantia_disparos) }) }))
    .filter((a) => a.situacao === "perto");

  // Revisão anual dos HIPROs: avisa 30 dias antes e quando venceu. Consulta
  // à parte para não derrubar nada se a coluna ainda não existir.
  const { data: revisoesRaw } = await supabase.from("equipments").select("code, name, ultima_revisao");
  const revisoesAlerta = (revisoesRaw ?? [])
    .map((e) => ({ code: e.code as string, nome: e.name as string, ...situacaoRevisao(e.ultima_revisao as string | null, todayStr) }))
    .filter((e) => e.situacao === "perto" || e.situacao === "vencida");

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

  // Tarefas: o Dashboard é a tela que se abre todo dia, então é aqui que elas
  // precisam nascer e aparecer (antes só nasciam ao abrir Funil ou Tarefas, e
  // a tarefa pós-locação some se passar a janela sem ninguém abrir essas
  // telas). Falha aqui não derruba o Dashboard: é aviso, não dinheiro.
  await supabase.rpc("gerar_tarefas_recontato");
  await supabase.rpc("gerar_tarefas_agenda");
  const { data: tarefasPendentes } = await supabase
    .from("tasks")
    .select("id, type, due_date")
    .eq("status", "pendente")
    .eq("is_test", false);
  const tarefasDeHoje = (tarefasPendentes ?? []).filter((t: any) => t.due_date <= todayStr);
  const tarefasPorTipo = new Map<string, number>();
  for (const t of tarefasDeHoje as any[]) tarefasPorTipo.set(t.type, (tarefasPorTipo.get(t.type) ?? 0) + 1);
  const ROTULO_TAREFA: Record<string, string> = {
    recontato: "recontato",
    pos_locacao: "pós-locação",
    contato_inicial: "contato inicial",
    cobranca_taxa: "cobrança de taxa",
    confirmacao: "confirmação",
    followup: "follow-up",
  };
  const resumoTarefas = Array.from(tarefasPorTipo.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, qtd]) => `${qtd} ${ROTULO_TAREFA[tipo] ?? tipo}`)
    .join(", ");

  // Respostas do formulário da Academy esperando revisão.
  const { count: cadastrosNovos } = await supabase
    .from("cadastros_recebidos")
    .select("id", { count: "exact", head: true })
    .eq("status", "pendente");

  // Clientes que preencheram o formulário do Planejador e ainda esperam o acesso.
  const { data: convitesPreenchidos } = await supabase
    .from("convites_cadastro")
    .select("id, resultado_client_id, preenchido_em, clients:resultado_client_id(name, display_name, treatment)")
    .not("preenchido_em", "is", null)
    .not("resultado_client_id", "is", null)
    .order("preenchido_em", { ascending: false })
    .limit(20);
  const idsConvite = Array.from(new Set((convitesPreenchidos ?? []).map((c: any) => c.resultado_client_id)));
  const { data: loginsAtivos } = idsConvite.length
    ? await supabase.from("profiles").select("cliente_id").in("cliente_id", idsConvite).eq("active", true)
    : { data: [] as { cliente_id: string }[] };
  const comLogin = new Set((loginsAtivos ?? []).map((p: any) => p.cliente_id));
  const vistos = new Set<string>();
  const acessosParaLiberar = (convitesPreenchidos ?? [])
    .filter((c: any) => !comLogin.has(c.resultado_client_id) && !vistos.has(c.resultado_client_id) && vistos.add(c.resultado_client_id))
    .map((c: any) => {
      const cl = Array.isArray(c.clients) ? c.clients[0] : c.clients;
      return { clientId: c.resultado_client_id as string, nome: [cl?.treatment, cl?.display_name || cl?.name].filter(Boolean).join(" ") || "Cliente" };
    });

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
    .select("date_start, date_end, client_id, clients(city)")
    .eq("is_test", false)
    .in("event_type", ["hipro_1", "hipro_2"])
    .neq("status", "cancelada")
    .gt("date_end", todayStr)
    .lte("date_start", radarEndStr);

  const normalizedRadarEvents = (radarEvents ?? []).map((e: any) => ({
    date_start: e.date_start as string,
    date_end: (e.date_end ?? e.date_start) as string,
    city: (Array.isArray(e.clients) ? e.clients[0]?.city : e.clients?.city) ?? null,
  }));
  const busyDaysSet = new Set(normalizedRadarEvents.flatMap((e) => diasDoPeriodo(e.date_start, e.date_end)));
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

  // Empréstimo a terceiros e a devolução dele mexem no caixa (Saldo), mas não
  // são receita nem despesa: ficam fora de Entradas, Saídas, Resultado e gráficos.
  const normalizedRows = (transactions ?? [])
    .map((t: any) => ({
      ...t,
      categories: Array.isArray(t.categories) ? (t.categories[0] ?? null) : (t.categories ?? null),
    }))
    .filter((t: any) => !ehCategoriaDeEmprestimo(t.categories?.name) && !foraDoResultadoPorCartao(t.cartao_mov));
  // Compra no cartão só tira dinheiro quando a fatura é paga.
  const saldoTotal = (allTimeTransactions ?? []).filter((t: any) => !foraDoSaldo(t)).reduce(
    (sum, t) => sum + (t.type === "entrada" ? Number(t.amount) : -Number(t.amount)),
    0
  );

  // Ticket médio = valor das locações do período dividido pelo número de
  // locações contabilizáveis (sem cancelada nem teste). Antes dividia todas
  // as entradas de caixa (taxa de reserva, mentoria, ajuda de custo,
  // recebimento de locações de outros períodos), o que inflava o número.
  const valorLocacoesPeriodo = (equipmentRentals ?? []).reduce((sum, r) => sum + Number(r.calculated_value), 0);
  const ticketMedio = billableRentalsCount && billableRentalsCount > 0 ? valorLocacoesPeriodo / billableRentalsCount : 0;

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

  // Saudação do topo.
  const { data: { user: usuario } } = await supabase.auth.getUser();
  const { data: perfilDash } = usuario
    ? await supabase.from("profiles").select("name").eq("id", usuario.id).single()
    : { data: null };
  const nomePerfil = ((perfilDash?.name as string | undefined) ?? "").trim();
  const primeiroNome = nomePerfil.includes("@") ? "" : (nomePerfil.split(/\s+/)[0] ?? "");
  const hora = Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date()));
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
  const dataHojeExtenso = format(new Date(`${todayStr}T12:00:00`), "EEE, d 'de' MMM", { locale: ptBR });
  const tarefasAtrasadas = tarefasDeHoje.filter((t: any) => t.due_date < todayStr).length;

  // Todos os avisos num bloco só, cada um levando à lista do que avisa.
  const avisos: AvisoDash[] = [];
  if (taxasAReceberCount > 0)
    avisos.push({
      id: "taxas",
      icone: "taxa",
      texto: `${taxasAReceberCount} ${taxasAReceberCount === 1 ? "taxa de reserva" : "taxas de reserva"} a receber`,
      detalhe: `${formatCurrency(taxasAReceberTotal)}${taxasVencidasCount > 0 ? ` · ${taxasVencidasCount} ${taxasVencidasCount === 1 ? "vencida" : "vencidas"} (mais de ${diasCobrancaTaxa} dias)` : ""}`,
      href: "/pendencias#taxas",
      nivel: taxasVencidasCount > 0 ? "urgente" : "atencao",
    });
  if (semDisparos.length > 0)
    avisos.push({
      id: "sem-disparos",
      icone: "disparos",
      texto: `${semDisparos.length} ${semDisparos.length === 1 ? "atendimento sem disparos lançados" : "atendimentos sem disparos lançados"}`,
      detalhe: "Já passaram e ainda não foram cobrados",
      href: "/pendencias#sem-disparos",
      nivel: "urgente",
    });
  if (revisoesAlerta.length > 0)
    avisos.push({
      id: "revisao",
      icone: "equipamento",
      texto: "Revisão anual dos HIPROs",
      detalhe: revisoesAlerta
        .map((e) => (e.situacao === "vencida" ? `${e.nome} vencida` : e.dias === 0 ? `${e.nome} hoje` : `${e.nome} em ${e.dias} ${e.dias === 1 ? "dia" : "dias"}`))
        .join(", "),
      href: `/equipamentos#revisao-${revisoesAlerta[0].code}`,
      nivel: revisoesAlerta.some((e) => e.situacao === "vencida") ? "urgente" : "atencao",
    });
  if (pendingConfirmations && pendingConfirmations > 0)
    avisos.push({
      id: "confirmacoes",
      icone: "confirmacao",
      texto: `${pendingConfirmations} ${pendingConfirmations === 1 ? "atendimento sem confirmação" : "atendimentos sem confirmação"}`,
      detalhe: "Nos próximos 7 dias",
      href: "/agenda#confirmacoes",
      nivel: "atencao",
    });
  if (tarefasDeHoje.length > 0)
    avisos.push({
      id: "tarefas",
      icone: "tarefas",
      texto: `Atacar a fila: ${tarefasDeHoje.length} ${tarefasDeHoje.length === 1 ? "tarefa" : "tarefas"}${tarefasAtrasadas > 0 ? ` (${tarefasAtrasadas} atrasada${tarefasAtrasadas > 1 ? "s" : ""})` : ""}`,
      detalhe: resumoTarefas,
      href: "/tarefas?fila=1",
      nivel: tarefasAtrasadas > 0 ? "atencao" : "info",
    });
  // Relacionamento: quem está na hora de uma conversa (no máximo 8 por dia).
  let paraChamar = 0;
  try {
    paraChamar = (await carregarRelacionamento(supabase, todayStr)).filter((p) => p.devida).length;
  } catch {
    // aviso opcional: sem ele o Dashboard segue
  }
  if (paraChamar > 0)
    avisos.push({
      id: "relacionamento",
      icone: "conversa",
      texto: `${Math.min(paraChamar, LIMITE_DIARIO)} ${Math.min(paraChamar, LIMITE_DIARIO) === 1 ? "pessoa para chamar hoje" : "pessoas para chamar hoje"}`,
      detalhe: "Clientes e leads na hora de uma conversa, com o WhatsApp pronto",
      href: "/relacionamento",
      nivel: "info",
    });
  if (aplicadoresAlerta.length > 0)
    avisos.push({
      id: "aplicadores",
      icone: "equipamento",
      texto: "Garantia de aplicador acabando",
      detalhe: aplicadoresAlerta.map((a) => `${a.nome} em ${Math.round((a.pct ?? 0) * 100)}%`).join(", "),
      href: "/equipamentos#aplicadores",
      nivel: "atencao",
    });
  if (cadastrosNovos && cadastrosNovos > 0)
    avisos.push({
      id: "cadastros",
      icone: "cadastro",
      texto: `${cadastrosNovos} ${cadastrosNovos === 1 ? "cadastro novo do formulário" : "cadastros novos do formulário"}`,
      detalhe: "Conferir e liberar na Academy",
      href: "/clientes/cadastros",
      nivel: "info",
    });
  for (const c of acessosParaLiberar)
    avisos.push({
      id: `acesso-${c.clientId}`,
      icone: "acesso",
      texto: `${c.nome} quer acesso ao Planejador`,
      detalhe: "Preencheu o cadastro: toque para liberar",
      href: `/clientes/${c.clientId}`,
      nivel: "info",
    });

  // Próximos dias na prévia: hoje e os próximos, até 3 dias com atendimento.
  const proximosDias = upcomingGroups.slice(0, 3);
  const rotuloPeriodo = resolverPeriodo(searchParams.period, searchParams.from, searchParams.to).rotulo;

  return (
    <div className="space-y-4">
      <MesCard
        saudacao={`${saudacao}${primeiroNome ? `, ${primeiroNome}` : ""} · ${dataHojeExtenso}`}
        rotuloMes={rotuloMesAtual}
        locacoes={locMes}
        preReservas={preMes}
        metaMin={META_MIN}
        metaMax={META_MAX}
        meta={metaDoMes}
        faturamento={faturamentoMes}
      />

      <PrecisaDeVoce avisos={avisos} />

      {/* Dinheiro agora */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/financeiro" className="cartao p-4 active:bg-neutral-50">
          <IconeChip icone={Wallet} cor="teal" className="mb-2" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Saldo em caixa</p>
          <p className={`mt-1 text-lg font-extrabold tabular-nums ${saldoTotal < 0 ? "text-rose-600" : "text-neutral-900"}`}>{formatCurrency(saldoTotal)}</p>
          <p className="text-[11px] text-neutral-400">Ver o financeiro →</p>
        </Link>
        <Link href="/pendencias" className="cartao p-4 active:bg-neutral-50">
          <IconeChip icone={HandCoins} cor="ambar" className="mb-2" />
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">A receber</p>
          <p className={`mt-1 text-lg font-extrabold tabular-nums ${pendencias.total > 0 ? "text-amber-600" : "text-neutral-900"}`}>{formatCurrency(pendencias.total)}</p>
          <p className="truncate text-[11px] text-neutral-400">
            {pendencias.clientes.length === 0
              ? "Ninguém devendo"
              : `${pendencias.clientes.length} ${pendencias.clientes.length === 1 ? "cliente" : "clientes"} · mais antigo ${pendencias.maiorAtraso}d`}
          </p>
        </Link>
      </div>

      <PrevisaoCaixaCard p30={previsao30} p60={previsao60} />

      <OpportunityRadar freeDays={freeDays} citiesInRoute={citiesInRoute} leads={dormantLeads ?? []} />

      {proximosDias.length > 0 && (
        <section className="cartao p-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Próximos dias</p>
            <Link href="/agenda" className="flex items-center gap-1 text-xs font-semibold text-brand-teal-dark">
              <CalendarDays size={13} /> Agenda
            </Link>
          </div>
          <ul className="space-y-2">
            {proximosDias.map(({ date, events }) => (
              <li key={date} className="flex gap-3">
                <Link href={linkDiaAgenda(date)} className="w-[86px] flex-shrink-0 pt-0.5 text-xs font-semibold text-neutral-500">
                  {date === todayStr ? "Hoje" : formatWeekdayDate(date)}
                </Link>
                <div className="min-w-0 flex-1 space-y-1">
                  {events.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-sm">
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${e.event_type === "hipro_1" ? "bg-brand-teal" : "bg-brand-blue"}`} />
                      <Link href={linkEvento(e.id)} className="flex-shrink-0 font-semibold text-neutral-900">
                        {e.event_type === "hipro_1" ? "HIPRO 1" : "HIPRO 2"}
                      </Link>
                      {e.clients?.name && (
                        <span className="min-w-0 truncate text-neutral-500">
                          <LinkCliente id={e.client_id}>{e.clients.name}</LinkCliente>
                        </span>
                      )}
                      {!e.confirmed && <span className="ml-auto h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" title="não confirmado" />}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Números do período escolhido */}
      <section className="space-y-3 pt-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-neutral-800">Números do período · {rotuloPeriodo}</p>
          <PeriodFilter padrao="mes" />
        </div>

        <div className="cartao p-4">
          <div className="grid grid-cols-2 gap-3">
            <Link href={`/locacoes?${periodQuery}`}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Locações</p>
              <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-neutral-900">{billableRentalsCount ?? 0}</p>
            </Link>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Ticket médio</p>
              <p className="mt-0.5 text-2xl font-extrabold tabular-nums text-neutral-900">{formatCurrency(ticketMedio)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5 text-[11.5px] font-semibold">
            <span className="rounded-full bg-brand-teal/10 px-2.5 py-1 text-brand-teal-dark">{concluidasCount ?? 0} concluídas</span>
            <span className="rounded-full bg-brand-pink/10 px-2.5 py-1 text-brand-pink-dark">{canceladasCount ?? 0} canceladas</span>
            <span className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-brand-blue">{reagendadasCount} reagendadas</span>
          </div>

          {equipmentSummary.length > 0 && (
            <div className="mt-4 border-t border-neutral-100 pt-3">
              <p className="mb-2 text-[11px] text-neutral-500">
                Ocupação {rotuloOcupacao}: <span className="font-bold text-neutral-900">{Math.round(ocupacaoGeralPct * 100)}%</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {equipmentSummary.map((eq) => (
                  <Link key={eq.id} href={`/dashboard/equipamentos/${eq.id}?${periodQuery}`} className="rounded-2xl bg-neutral-50 p-3 active:bg-neutral-100">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-neutral-800">
                      <span className={`h-2 w-2 rounded-full ${EQUIPMENT_COLORS[eq.code] ?? "bg-neutral-400"}`} />
                      {eq.name}
                    </p>
                    <p className="mt-1 text-base font-extrabold tabular-nums text-brand-teal-dark">{formatCurrency(eq.receita)}</p>
                    <p className="text-[11px] text-neutral-500">
                      {eq.locacoes} {eq.locacoes === 1 ? "locação" : "locações"} · {Math.round(eq.ocupacao.pct * 100)}% ocupado
                    </p>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                      <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.min(100, Math.round(eq.ocupacao.pct * 100))}%` }} />
                    </div>
                    {eq.pendente > 0 && <p className="mt-1 text-[11px] font-semibold text-amber-600">Em aberto {formatCurrency(eq.pendente)}</p>}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <DashboardCharts
          transactions={normalizedRows}
          inicio={from.toISOString().slice(0, 10)}
          ate={[to.toISOString().slice(0, 10), hojeLocal()].sort()[0]}
          rotuloPeriodo={rotuloPeriodo}
        />
      </section>
    </div>
  );
}
