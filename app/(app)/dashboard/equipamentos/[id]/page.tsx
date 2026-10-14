import Link from "next/link";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format";

function formatDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  const s = format(d, "dd 'de' MMM", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function EquipmentDetailPage(
  props: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const supabase = createClient();

  const { data: equipment } = await supabase
    .from("equipments")
    .select("id, code, name")
    .eq("id", params.id)
    .single();

  // Mesmo período em que o usuário estava no Dashboard quando clicou no
  // card, para a lista abrir já filtrada de forma consistente. Sem from/to
  // na URL, cai pro mês atual.
  const now = new Date();
  const fromStr = searchParams.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const toStr = searchParams.to ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const { data: rentals } = await supabase
    .from("rentals_contabilizaveis")
    .select("id, event_date, calculated_value, status, client_id, clients(name)")
    .eq("equipment_id", params.id)
    .gte("event_date", fromStr)
    .lte("event_date", toStr)
    .order("event_date", { ascending: false });

  const rentalIds = (rentals ?? []).map((r) => r.id);
  const { data: situacoes } = rentalIds.length
    ? await supabase
        .from("rentals_situacao_pagamento")
        .select("rental_id, total_pago, saldo, situacao")
        .in("rental_id", rentalIds)
    : { data: [] as { rental_id: string; total_pago: number; saldo: number; situacao: string }[] };

  const situacaoByRentalId = new Map((situacoes ?? []).map((s) => [s.rental_id, s]));

  const normalizedRentals = (rentals ?? []).map((r: any) => ({
    ...r,
    clients: Array.isArray(r.clients) ? (r.clients[0] ?? null) : (r.clients ?? null),
    situacao: situacaoByRentalId.get(r.id) ?? null,
  }));

  const totalCobrado = normalizedRentals.reduce((sum, r) => sum + Number(r.calculated_value), 0);
  const totalPendente = normalizedRentals.reduce(
    (sum, r) => sum + Number(r.situacao?.saldo ?? 0),
    0
  );

  const SITUACAO_LABEL: Record<string, { label: string; className: string }> = {
    pago: { label: "Pago", className: "bg-brand-teal/15 text-brand-teal" },
    parcial: { label: "Parcial", className: "bg-amber-100 text-amber-700" },
    pendente: { label: "Pendente", className: "bg-brand-pink/15 text-brand-pink" },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-700">
          ← Dashboard
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-semibold text-neutral-900">
          {equipment?.name ?? "Equipamento"}
        </h1>
        <p className="text-sm text-neutral-500">
          {formatDate(fromStr)} até {formatDate(toStr)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Total cobrado</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(totalCobrado)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Pendente</p>
          <p className="mt-1 text-lg font-semibold text-amber-600">{formatCurrency(totalPendente)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{normalizedRentals.length}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200/60 text-left text-xs text-neutral-500">
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Data</th>
              <th className="px-4 py-3 font-medium text-right">Valor</th>
              <th className="px-4 py-3 font-medium text-right">Pago</th>
              <th className="px-4 py-3 font-medium text-right">Saldo</th>
              <th className="px-4 py-3 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {normalizedRentals.map((r) => {
              const situacaoKey = r.situacao?.situacao ?? "pendente";
              const situacaoInfo = SITUACAO_LABEL[situacaoKey] ?? SITUACAO_LABEL.pendente;
              return (
                <tr key={r.id} className="border-b border-neutral-200/40 last:border-0">
                  <td className="px-4 py-3 text-neutral-900">
                    {r.clients?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {formatDate(r.event_date)}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-900">
                    {formatCurrency(Number(r.calculated_value))}
                  </td>
                  <td className="px-4 py-3 text-right text-neutral-500">
                    {formatCurrency(Number(r.situacao?.total_pago ?? 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-amber-600">
                    {formatCurrency(Number(r.situacao?.saldo ?? 0))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${situacaoInfo.className}`}>
                      {situacaoInfo.label}
                    </span>
                  </td>
                </tr>
              );
            })}
            {normalizedRentals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-neutral-500">
                  Nenhuma locação neste período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
