import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { resolvePeriod } from "@/lib/period";
import { formatCurrency } from "@/lib/format";
import PeriodFilter from "@/components/PeriodFilter";
import DashboardCharts from "@/components/DashboardCharts";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { period?: string; from?: string; to?: string };
}) {
  const supabase = createClient();
  const { from, to } = resolvePeriod(searchParams.period, searchParams.from, searchParams.to);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);

  // Lançamentos do período filtrado, para os cards de Entradas/Saídas/Resultado e os gráficos
  const { data: transactions } = await supabase
    .from("transactions")
    .select("id, type, amount, date, category_id, categories(name)")
    .eq("scope", "harmonize")
    .gte("date", fromStr)
    .lte("date", toStr);

  // Todos os lançamentos históricos, para o Saldo acumulado (não depende do filtro de período)
  const { data: allTimeTransactions } = await supabase
    .from("transactions")
    .select("type, amount")
    .eq("scope", "harmonize");

  const { count: rentalsCount } = await supabase
    .from("rentals")
    .select("id", { count: "exact", head: true })
    .gte("event_date", fromStr)
    .lte("event_date", toStr);

  const [{ count: concluidasCount }, { count: canceladasCount }, { count: reagendadasCount }] = await Promise.all([
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "realizada")
      .gte("event_date", fromStr)
      .lte("event_date", toStr),
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("status", "cancelada")
      .gte("event_date", fromStr)
      .lte("event_date", toStr),
    supabase
      .from("rentals")
      .select("id", { count: "exact", head: true })
      .eq("rescheduled", true)
      .gte("event_date", fromStr)
      .lte("event_date", toStr),
  ]);

  // Resumo por equipamento (HIPRO 1 / HIPRO 2), no mesmo período filtrado
  // acima — antes só existia na tela separada de Equipamentos; junto no
  // Dashboard porque é a primeira coisa que se quer ver ao abrir o app.
  const { data: equipments } = await supabase.from("equipments").select("id, code, name").order("code");
  const { data: equipmentRentals } = await supabase
    .from("rentals")
    .select("equipment_id, calculated_value")
    .gte("event_date", fromStr)
    .lte("event_date", toStr);

  const todayStr = new Date().toISOString().slice(0, 10);
  const in7Str = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const { count: pendingConfirmations } = await supabase
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("confirmed", false)
    .neq("status", "cancelada")
    .gte("date_start", todayStr)
    .lte("date_start", in7Str);

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

  const ticketMedio = rentalsCount && rentalsCount > 0 ? entradas / rentalsCount : 0;

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
    };
  });

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

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">{card.label}</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(card.value)}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{rentalsCount ?? 0}</p>
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
          <p className="mt-1 text-lg font-semibold text-brand-blue">{reagendadasCount ?? 0}</p>
        </div>
      </div>

      {equipmentSummary.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-semibold text-neutral-700 dark:text-neutral-300">Equipamentos</p>
          <div className="grid grid-cols-2 gap-3">
            {equipmentSummary.map((eq) => (
              <div
                key={eq.id}
                className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55"
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${EQUIPMENT_COLORS[eq.code] ?? "bg-neutral-400"}`} />
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{eq.name}</p>
                </div>
                <p className="mt-2 text-lg font-semibold text-brand-teal">{formatCurrency(eq.receita)}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {eq.locacoes} {eq.locacoes === 1 ? "locação" : "locações"} no período
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <DashboardCharts transactions={normalizedRows} />
    </div>
  );
}
