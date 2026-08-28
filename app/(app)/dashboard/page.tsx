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

  const rows = transactions ?? [];
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Dashboard</h1>
        <PeriodFilter />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-neutral-500">{card.label}</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(card.value)}</p>
          </div>
        ))}
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">Locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{rentalsCount ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(ticketMedio)}</p>
        </div>
      </div>

      <DashboardCharts transactions={rows as any} />
    </div>
  );
}
