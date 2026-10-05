import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import Link from "next/link";
import ReceberPagamentoBotao from "@/components/ReceberPagamentoBotao";
import TaxaRecebidaBotao from "@/components/TaxaRecebidaBotao";

export const dynamic = "force-dynamic";

function nomeEquipamento(eq: any): string | null {
  const e = Array.isArray(eq) ? eq[0] : eq;
  return e?.name ?? null;
}

export default async function AgendaHojePage() {
  const supabase = await createClient();

  // Dia de Brasília: com UTC, depois das 21h "hoje" já virava amanhã.
  const hojeStr = hojeLocal();

  // Locações já finalizadas (com disparos/valor lançados) a partir de hoje.
  const { data: rentals } = await supabase
    .from("rentals")
    .select("id, client_id, event_date, event_date_end, pago, clients(name), equipments(name)")
    .eq("is_test", false)
    .neq("status", "cancelada")
    .gte("event_date", hojeStr)
    .order("event_date", { ascending: true })
    .limit(50);

  // Pré-reservas ("Agendar sem disparos") que ainda não viraram locação —
  // ficam em calendar_events, não em rentals, e são justamente os
  // "próximos agendamentos" que ainda não têm disparos contados.
  const { data: preReservas } = await supabase
    .from("calendar_events")
    .select("id, client_id, date_start, date_end, taxa_status, clients(name), equipments(name)")
    .eq("is_test", false)
    .eq("status", "pre_reserva")
    .is("rental_id", null)
    .gte("date_start", hojeStr)
    .order("date_start", { ascending: true })
    .limit(50);

  // Saldo em aberto das locações listadas, para oferecer o recebimento aqui.
  const idsLocacoes = (rentals ?? []).map((r: any) => r.id);
  const { data: situacoes } = idsLocacoes.length
    ? await supabase.from("rentals_situacao_pagamento").select("rental_id, saldo").in("rental_id", idsLocacoes)
    : { data: [] as any[] };
  const saldoPorLocacao = new Map<string, number>((situacoes ?? []).map((x: any) => [x.rental_id, Number(x.saldo)]));

  const listaRentals = (rentals ?? []).map((r: any) => ({
    rentalId: r.id as string | null,
    eventId: null as string | null,
    clientId: (r.client_id ?? null) as string | null,
    saldo: saldoPorLocacao.get(r.id) ?? 0,
    taxaPendente: false,
    id: `rental-${r.id}`,
    data_inicio: r.event_date,
    data_fim: r.event_date_end,
    cliente: Array.isArray(r.clients) ? (r.clients[0]?.name ?? null) : (r.clients?.name ?? null),
    equipamento: nomeEquipamento(r.equipments),
    pendente: false,
  }));

  const listaPreReservas = (preReservas ?? []).map((r: any) => ({
    rentalId: null as string | null,
    eventId: r.id as string | null,
    clientId: (r.client_id ?? null) as string | null,
    saldo: 0,
    taxaPendente: r.taxa_status === "pendente",
    id: `reserva-${r.id}`,
    data_inicio: r.date_start,
    data_fim: r.date_end,
    cliente: Array.isArray(r.clients) ? (r.clients[0]?.name ?? null) : (r.clients?.name ?? null),
    equipamento: nomeEquipamento(r.equipments),
    pendente: true,
  }));

  const lista = [...listaRentals, ...listaPreReservas].sort((a, b) =>
    a.data_inicio.localeCompare(b.data_inicio)
  );

  return (
    <div className="min-h-screen bg-neutral-50 p-4 dark:bg-neutral-950">
      <h1 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Próximos agendamentos</h1>

      {lista.length === 0 && (
        <p className="text-sm text-neutral-400">Nenhum agendamento futuro.</p>
      )}

      <ul className="space-y-2">
        {lista.map((r) => (
          <li
            key={r.id}
            className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-center justify-between gap-2">
              {r.clientId ? (
                <Link
                  href={`/clientes/${r.clientId}`}
                  className="text-sm font-medium text-neutral-900 underline decoration-transparent underline-offset-2 hover:decoration-brand-teal dark:text-neutral-100"
                >
                  {r.cliente ?? "-"}
                </Link>
              ) : (
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.cliente ?? "-"}</p>
              )}
              {r.pendente && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                  sem disparos ainda
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {r.equipamento ? `${r.equipamento} · ` : ""}
              {r.data_fim && r.data_fim !== r.data_inicio
                ? `${formatDate(r.data_inicio)} a ${formatDate(r.data_fim)}`
                : formatDate(r.data_inicio)}
            </p>
            <div className="mt-2 space-y-2">
              {r.taxaPendente && r.eventId && <TaxaRecebidaBotao eventId={r.eventId} />}
              {r.rentalId && r.saldo > 0.009 && <ReceberPagamentoBotao rentalId={r.rentalId} saldo={r.saldo} />}
              <Link
                href={`/agenda?date=${r.data_inicio}`}
                className="block rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                {r.pendente ? "Abrir na agenda (finalizar com disparos)" : "Abrir na agenda"}
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
