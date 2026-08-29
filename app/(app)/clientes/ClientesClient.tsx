"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NovoClienteModal from "./NovoClienteModal";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, buildMapsLink, buildWazeLink, buildWhatsAppLink } from "@/lib/format";

interface ClientRow {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  city: string | null;
  address: string | null;
  reservation_fee_status: string;
  data_evento: string | null;
  stats: { count: number; total: number; lastDate: string | null };
  nextEvent: { date_start: string; confirmed: boolean } | null;
}

export default function ClientesClient({ initialClients }: { initialClients: ClientRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return initialClients.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        (c.clinic_name ?? "").toLowerCase().includes(term) ||
        (c.city ?? "").toLowerCase().includes(term)
    );
  }, [initialClients, search]);

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  async function toggleConfirmed(clientId: string, currentEvent: { date_start: string; confirmed: boolean }) {
    await supabase
      .from("calendar_events")
      .update({ confirmed: !currentEvent.confirmed })
      .eq("client_id", clientId)
      .eq("date_start", currentEvent.date_start);
    router.refresh();
  }

  async function markFeePaid(clientId: string) {
    await supabase.from("clients").update({ reservation_fee_status: "pago" }).eq("id", clientId);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Clientes</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-teal-dark"
        >
          + Novo cliente
        </button>
      </div>

      <input
        placeholder="Buscar por nome, clínica ou cidade..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-sm"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-brand-teal dark:border-neutral-800 dark:bg-neutral-900"
          >
            <Link href={`/clientes/${c.id}`}>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">{c.name}</p>
              {c.clinic_name && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{c.clinic_name}</p>}
              <p className="mt-0.5 text-xs text-neutral-400">{c.city ?? "-"}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-neutral-50 p-2.5 text-xs dark:bg-neutral-800/60">
                <div>
                  <p className="text-neutral-400">Locações</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">{c.stats.count}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Total</p>
                  <p className="font-medium text-brand-teal">{formatCurrency(c.stats.total)}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Indicações</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">—</p>
                </div>
                <div>
                  <p className="text-neutral-400">Última reserva</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">
                    {c.stats.lastDate ? formatDate(c.stats.lastDate) : "-"}
                  </p>
                </div>
              </div>
            </Link>

            {(c.nextEvent || c.reservation_fee_status !== "nao_aplica") && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.nextEvent && (
                  <button
                    onClick={() => toggleConfirmed(c.id, c.nextEvent!)}
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      c.nextEvent.confirmed
                        ? "bg-brand-teal/10 text-brand-teal"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}
                  >
                    📅 {formatDate(c.nextEvent.date_start)} · {c.nextEvent.confirmed ? "Confirmado" : "Não confirmado"}
                  </button>
                )}
                {c.reservation_fee_status === "pendente" && (
                  <button
                    onClick={() => markFeePaid(c.id)}
                    className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  >
                    💳 Taxa pendente
                  </button>
                )}
                {c.reservation_fee_status === "pago" && (
                  <span className="rounded-full bg-brand-teal/10 px-2 py-1 text-[11px] font-medium text-brand-teal">
                    💳 Taxa paga
                  </span>
                )}
              </div>
            )}

            {(c.whatsapp || c.address) && (
              <div className="mt-2 flex gap-2">
                {buildWhatsAppLink(c.whatsapp) && (
                  <a
                    href={buildWhatsAppLink(c.whatsapp)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs text-brand-teal underline underline-offset-2"
                  >
                    WhatsApp
                  </a>
                )}
                {buildMapsLink(c.address) && (
                  <a
                    href={buildMapsLink(c.address)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs text-brand-blue underline underline-offset-2"
                  >
                    Maps
                  </a>
                )}
                {buildWazeLink(c.address) && (
                  <a
                    href={buildWazeLink(c.address)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs text-brand-lilac underline underline-offset-2"
                  >
                    Waze
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300 bg-white py-12 text-center text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
            Nenhum cliente encontrado.
          </div>
        )}
      </div>

      {modalOpen && <NovoClienteModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
    </div>
  );
}
