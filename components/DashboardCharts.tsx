"use client";

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { formatCurrency, formatDate } from "@/lib/format";

const COLORS = ["#3DBFB8", "#E8789A", "#7EC8E3", "#B8A0D0", "#94a3b8"];

interface TransactionRow {
  type: "entrada" | "saida";
  amount: number;
  date: string;
  categories?: { name: string } | null;
}

export default function DashboardCharts({ transactions }: { transactions: TransactionRow[] }) {
  const byDay: Record<string, { entrada: number; saida: number }> = {};
  for (const t of transactions) {
    const day = t.date;
    if (!byDay[day]) byDay[day] = { entrada: 0, saida: 0 };
    byDay[day][t.type] += Number(t.amount);
  }
  const fluxoData = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date: formatDate(date), ...v }));

  const byCategory: Record<string, number> = {};
  for (const t of transactions) {
    if (t.type !== "entrada") continue;
    const name = t.categories?.name ?? "Outros";
    byCategory[name] = (byCategory[name] ?? 0) + Number(t.amount);
  }
  const categoriaData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-neutral-700">Fluxo financeiro</p>
        {fluxoData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={fluxoData}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
              <Bar dataKey="entrada" name="Entradas" fill="#3DBFB8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saida" name="Saídas" fill="#E8789A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
        <p className="mb-3 text-sm font-medium text-neutral-700">Receitas por categoria</p>
        {categoriaData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={categoriaData} dataKey="value" nameKey="name" outerRadius={80} label>
                {categoriaData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-neutral-400">
      Sem lançamentos no período
    </div>
  );
}
