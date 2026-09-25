import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import { analyzePricingCliff } from "@/lib/pricing-opportunity";
import { resolverPeriodo } from "@/lib/period";
import RelatoriosClient from "./RelatoriosClient";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function oneOf<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

// ============================================================
// Relatórios estratégicos: diferente do Dashboard (que mostra o dia a
// dia) e do Radar de Oportunidades tático (dias livres x leads
// parados), esta tela cruza dados que ninguém para pra somar sozinho —
// concentração de risco, buracos na precificação, funil de follow-up,
// origem que converte de verdade. Tudo calculado em cima do banco
// real a cada acesso, nunca hardcoded.
// ============================================================
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const supabase = createClient();
  const settings = await fetchSettings(supabase);

  // O padrão é "este ano", e não "este mês": relatório estratégico com
  // um mês de dados não sustenta conclusão nenhuma. Concentração de
  // receita em cima de quatro locações diria que um cliente é 60% do
  // faturamento, o que é ruído, não risco.
  const periodo = resolverPeriodo(searchParams.period ?? "ano", searchParams.from, searchParams.to);

  // NEM TUDO AQUI SEGUE O PERÍODO, DE PROPÓSITO.
  // Dinheiro e atividade seguem: faturamento, mix, concentração,
  // precificação e padrão de agenda respondem "no recorte escolhido".
  // Estado do mundo não segue: origem dos leads, funil de follow-up e
  // taxa a receber respondem "agora", e recortá-los por período daria
  // uma taxa de conversão inventada, já que um lead de janeiro pode
  // converter em agosto. A tela diz qual é qual, senão os dois números
  // lado a lado enganam.

  const [
    { data: rentals },
    { data: clients },
    { data: entradas },
    { data: followupTags },
    { data: bookedEvents },
  ] = await Promise.all([
    // Relatório é a tela de decidir, então nem teste nem locação
    // cancelada podem entrar na conta. As views rentals_contabilizaveis
    // e transactions_contabilizaveis já carregam as duas exclusões
    // dentro delas, por isso o .eq("is_test", false) sumiu dessas duas
    // linhas: a regra agora mora no banco, igual para todas as telas.
    // O que foi lançado em modo teste continua visível na tela de dados
    // de teste, que é quem lê a tabela crua de propósito.
    supabase
      .from("rentals_contabilizaveis")
      .select("shots, calculated_value")
      .gte("event_date", periodo.inicio)
      .lte("event_date", periodo.fim),
    supabase.from("clients").select("id, name, origem, stage, is_client").eq("is_test", false),
    supabase
      .from("transactions_contabilizaveis")
      .select("amount, client_id, categories(name), clients(name)")
      .eq("scope", "harmonize")
      .eq("type", "entrada")
      .gte("date", periodo.inicio)
      .lte("date", periodo.fim),
    supabase.from("tags").select("id, name").like("name", "Follow-up %"),
    supabase
      .from("calendar_events")
      .select("date_start")
      .in("event_type", ["hipro_1", "hipro_2"])
      .neq("status", "cancelada")
      .eq("is_test", false)
      .gte("date_start", periodo.inicio)
      .lte("date_start", periodo.fim),
  ]);

  // ---- 1) Degrau de incentivo de volume ----
  // Proposital: passar de tier2Limit disparos ativa uma taxa menor sobre
  // TODO o excedente, então uma locação um pouco maior pode sair mais
  // barata que uma um pouco menor — é assim mesmo, de propósito, pra dar
  // ao cliente um motivo concreto pra rodar mais disparos em vez de parar
  // perto do limite. O que vale rastrear não é "isso é um erro", e sim
  // quem está perto o suficiente da linha pra valer a pena avisar.
  const cliff = analyzePricingCliff(settings.pricing);
  const dealsInDeadZone = cliff
    ? (rentals ?? []).filter((r) => r.shots > settings.pricing.tier2Limit && r.shots <= cliff.deadZoneEndShots)
    : [];
  const deadZoneTotal = dealsInDeadZone.reduce((sum, r) => sum + Number(r.calculated_value), 0);
  // "Quase lá": ficou nos últimos 10% antes do limite, mas não cruzou.
  // São os candidatos ideais pra receber o aviso de "rode só mais um
  // pouco e paga menos" numa próxima locação.
  const nearMissThreshold = cliff ? Math.floor(cliff.peakShots * 0.9) : 0;
  const nearMissDeals = cliff
    ? (rentals ?? []).filter((r) => r.shots >= nearMissThreshold && r.shots <= cliff.peakShots)
    : [];

  // ---- 2) Taxa de compromisso pendente ----
  // Vem da view clientes_taxas, que soma as taxas que estão nos
  // agendamentos. Antes esta conta era "quantos clientes estão marcados
  // como pendentes, vezes R$ 250", o que só acertava por acidente: um
  // cliente com três datas reservadas devia três taxas e entrava na
  // conta como uma. Agora o valor é a soma real do que está em aberto.
  const { data: taxasEmAberto } = await supabase
    .from("clientes_taxas")
    .select("client_id, taxas_pendentes, valor_pendente")
    .gt("taxas_pendentes", 0);

  const nomePorId = new Map((clients ?? []).map((c: any) => [c.id, c.name as string]));
  const pendingFeeClients = (taxasEmAberto ?? [])
    .map((t: any) => ({
      name: nomePorId.get(t.client_id) ?? "",
      taxas: Number(t.taxas_pendentes),
      valor: Number(t.valor_pendente),
    }))
    // Cliente de teste não está em `clients`, então cai fora aqui.
    .filter((t) => t.name)
    .sort((a, b) => b.valor - a.valor);

  const pendingFeeTotal = pendingFeeClients.reduce((soma, t) => soma + t.valor, 0);

  // ---- 3) Concentração de receita ----
  const revenueByClient = new Map<string, { name: string; total: number }>();
  let totalRevenue = 0;
  for (const t of entradas ?? []) {
    totalRevenue += Number(t.amount);
    if (!t.client_id) continue;
    const clientName = oneOf<{ name: string }>(t.clients as any)?.name ?? "Sem nome";
    const cur = revenueByClient.get(t.client_id) ?? { name: clientName, total: 0 };
    cur.total += Number(t.amount);
    revenueByClient.set(t.client_id, cur);
  }
  const topClients = Array.from(revenueByClient.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
  const top3Total = topClients.slice(0, 3).reduce((s, c) => s + c.total, 0);
  const top3Share = totalRevenue > 0 ? top3Total / totalRevenue : 0;

  // ---- 4) Origem dos leads: quem converte de verdade ----
  const origemMap = new Map<string, { total: number; convertidos: number }>();
  for (const c of clients ?? []) {
    const origem = c.origem?.trim() || "Não informado";
    const cur = origemMap.get(origem) ?? { total: 0, convertidos: 0 };
    cur.total += 1;
    // is_client, não stage: stage é só a etapa atual do funil, e um
    // cliente já convertido pode estar de volta em "Agendamento" numa
    // segunda locação sem deixar de ser cliente (ver leva F).
    if (c.is_client) cur.convertidos += 1;
    origemMap.set(origem, cur);
  }
  const origemBreakdown = Array.from(origemMap.entries())
    .map(([origem, v]) => ({ origem, total: v.total, convertidos: v.convertidos, taxa: v.total > 0 ? v.convertidos / v.total : 0 }))
    .sort((a, b) => b.total - a.total);

  // ---- 5) Funil de follow-up: onde as tentativas perdem força ----
  const tagIds = (followupTags ?? []).map((t) => t.id);
  let followupBreakdown: { label: string; count: number }[] = [];
  if (tagIds.length > 0) {
    const { data: taggedClients } = await supabase
      .from("client_tags")
      .select("tag_id, tags(name)")
      .in("tag_id", tagIds);
    const countByTag = new Map<string, number>();
    for (const row of taggedClients ?? []) {
      const tagName = oneOf<{ name: string }>(row.tags as any)?.name ?? "";
      if (!tagName) continue;
      countByTag.set(tagName, (countByTag.get(tagName) ?? 0) + 1);
    }
    followupBreakdown = (followupTags ?? [])
      .map((t) => ({ label: t.name, count: countByTag.get(t.name) ?? 0 }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }
  const nutricaoCount = (clients ?? []).filter((c) => c.stage === "nutricao").length;

  // ---- 6) Padrão de agenda por dia da semana ----
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const e of bookedEvents ?? []) {
    const d = new Date(`${e.date_start}T00:00:00`);
    weekdayCounts[d.getDay()] += 1;
  }
  const weekdayBreakdown = WEEKDAY_LABELS.map((label, i) => ({ label, count: weekdayCounts[i] }));

  // ---- 7) Mix de receita por categoria ----
  const categoryMap = new Map<string, number>();
  for (const t of entradas ?? []) {
    const categoryName = oneOf<{ name: string }>(t.categories as any)?.name ?? "Outros";
    categoryMap.set(categoryName, (categoryMap.get(categoryName) ?? 0) + Number(t.amount));
  }
  const revenueMix = Array.from(categoryMap.entries())
    .map(([name, total]) => ({ name, total, share: totalRevenue > 0 ? total / totalRevenue : 0 }))
    .sort((a, b) => b.total - a.total);

  return (
    <RelatoriosClient
      periodo={periodo}
      cliff={cliff}
      dealsInDeadZoneCount={dealsInDeadZone.length}
      deadZoneTotal={deadZoneTotal}
      nearMissCount={nearMissDeals.length}
      nearMissThreshold={nearMissThreshold}
      pendingFeeCount={pendingFeeClients.length}
      pendingFeeTotal={pendingFeeTotal}
      pendingFeeNames={pendingFeeClients
        .slice(0, 15)
        .map((c) => (c.taxas > 1 ? `${c.name} (${c.taxas} datas)` : c.name))}
      totalRevenue={totalRevenue}
      topClients={topClients}
      top3Share={top3Share}
      origemBreakdown={origemBreakdown}
      followupBreakdown={followupBreakdown}
      nutricaoCount={nutricaoCount}
      weekdayBreakdown={weekdayBreakdown}
      revenueMix={revenueMix}
    />
  );
}
