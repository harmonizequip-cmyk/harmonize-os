"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import NovaLocacaoModal from "./NovaLocacaoModal";
import EditarClienteModal from "./EditarClienteModal";
import EditarLocacaoModal from "./EditarLocacaoModal";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

interface Client {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  notes: string | null;
  reservation_fee_status: string;
}

interface RentalRow {
  id: string;
  event_date: string;
  shots: number;
  calculated_value: number;
  payment_method: string;
  status: string;
  rescheduled: boolean;
  equipment_id: string;
  notes: string | null;
  equipments?: { name: string } | null;
}

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

export default function ClienteDetailClient({
  client,
  rentals,
  equipments,
}: {
  client: Client;
  rentals: RentalRow[];
  equipments: EquipmentOption[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<RentalRow | null>(null);

  const totalLocacoes = rentals.length;
  const totalFaturado = rentals.reduce((sum, r) => sum + Number(r.calculated_value), 0);
  const ticketMedio = totalLocacoes > 0 ? totalFaturado / totalLocacoes : 0;
  const ultimaLocacao = rentals[0]?.event_date;
  const concluidas = rentals.filter((r) => r.status === "realizada").length;
  const canceladas = rentals.filter((r) => r.status === "cancelada").length;
  const reagendadas = rentals.filter((r) => r.rescheduled).length;

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/clientes" className="text-sm text-neutral-400 hover:text-neutral-600">
          ← Clientes
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">{client.name}</h1>
            <button
              onClick={() => setEditClientOpen(true)}
              className="text-xs text-brand-teal underline underline-offset-2"
            >
              Editar
            </button>
          </div>
          {client.clinic_name && <p className="text-sm text-neutral-500">{client.clinic_name}</p>}
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-teal-dark"
        >
          + Nova locação
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-4">
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">WhatsApp</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{client.whatsapp ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">E-mail</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{client.email ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Cidade</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{client.city ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Observação</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{client.notes ?? "-"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Total de locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{totalLocacoes}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Total faturado</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(totalFaturado)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(ticketMedio)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Última locação</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {ultimaLocacao ? formatDate(ultimaLocacao) : "-"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-brand-teal/10 px-3 py-1 font-medium text-brand-teal">
          ✓ {concluidas} concluída{concluidas === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-brand-pink/10 px-3 py-1 font-medium text-brand-pink">
          ✕ {canceladas} cancelada{canceladas === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-medium text-brand-blue">
          ↻ {reagendadas} reagendada{reagendadas === 1 ? "" : "s"}
        </span>
        {client.reservation_fee_status === "pendente" && (
          <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            💳 Taxa de reserva pendente
          </span>
        )}
        {client.reservation_fee_status === "pago" && (
          <span className="rounded-full bg-brand-teal/10 px-3 py-1 font-medium text-brand-teal">
            💳 Taxa de reserva paga
          </span>
        )}
      </div>

      {/* Celular: cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {rentals.map((r) => (
          <div
            key={r.id}
            onClick={() => setEditingRental(r)}
            className="cursor-pointer rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-brand-teal dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.equipments?.name ?? "-"}</p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDate(r.event_date)} · {r.shots.toLocaleString("pt-BR")} disparos
                </p>
              </div>
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  r.status === "cancelada"
                    ? "bg-brand-pink/10 text-brand-pink"
                    : r.status === "realizada"
                      ? "bg-brand-teal/10 text-brand-teal"
                      : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                }`}
              >
                {r.status.replace("_", " ")}
                {r.rescheduled && " · ↻"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
              </span>
              <span className="font-medium text-brand-teal">{formatCurrency(Number(r.calculated_value))}</span>
            </div>
          </div>
        ))}
        {rentals.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white py-8 text-center text-neutral-400 dark:border-neutral-700 dark:bg-neutral-900">
            Nenhuma locação registrada ainda.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">HIPRO</th>
              <th className="px-4 py-3">Disparos</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((r) => (
              <tr
                key={r.id}
                onClick={() => setEditingRental(r)}
                className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-400">{formatDate(r.event_date)}</td>
                <td className="px-4 py-3 text-neutral-900 dark:text-neutral-100">{r.equipments?.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{r.shots.toLocaleString("pt-BR")}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-brand-teal">
                  {formatCurrency(Number(r.calculated_value))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      r.status === "cancelada"
                        ? "bg-brand-pink/10 text-brand-pink"
                        : r.status === "realizada"
                          ? "bg-brand-teal/10 text-brand-teal"
                          : "bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {r.status.replace("_", " ")}
                    {r.rescheduled && " · ↻"}
                  </span>
                </td>
              </tr>
            ))}
            {rentals.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma locação registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <NovaLocacaoModal
          clientId={client.id}
          clientName={client.name}
          clientWhatsapp={client.whatsapp}
          equipments={equipments}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editClientOpen && (
        <EditarClienteModal
          client={client}
          onClose={() => setEditClientOpen(false)}
          onSaved={() => {
            setEditClientOpen(false);
            router.refresh();
          }}
        />
      )}

      {editingRental && (
        <EditarLocacaoModal
          rental={editingRental}
          equipments={equipments}
          onClose={() => setEditingRental(null)}
          onSaved={() => {
            setEditingRental(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
