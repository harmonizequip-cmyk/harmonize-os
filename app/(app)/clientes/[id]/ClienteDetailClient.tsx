"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import NovaLocacaoModal from "./NovaLocacaoModal";

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
}

interface RentalRow {
  id: string;
  event_date: string;
  shots: number;
  calculated_value: number;
  payment_method: string;
  status: string;
  equipment_id: string;
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

  const totalLocacoes = rentals.length;
  const totalFaturado = rentals.reduce((sum, r) => sum + Number(r.calculated_value), 0);
  const ticketMedio = totalLocacoes > 0 ? totalFaturado / totalLocacoes : 0;
  const ultimaLocacao = rentals[0]?.event_date;

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
          <h1 className="text-xl font-semibold text-neutral-900">{client.name}</h1>
          {client.clinic_name && <p className="text-sm text-neutral-500">{client.clinic_name}</p>}
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-teal-dark"
        >
          + Nova locação
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:grid-cols-4">
        <div>
          <p className="text-xs text-neutral-500">WhatsApp</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.whatsapp ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">E-mail</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.email ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Cidade</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.city ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Observação</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.notes ?? "-"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">Total de locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{totalLocacoes}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">Total faturado</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(totalFaturado)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(ticketMedio)}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
          <p className="text-xs text-neutral-500">Última locação</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {ultimaLocacao ? formatDate(ultimaLocacao) : "-"}
          </p>
        </div>
      </div>

      {/* Celular: cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {rentals.map((r) => (
          <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-3 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">{r.equipments?.name ?? "-"}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatDate(r.event_date)} · {r.shots.toLocaleString("pt-BR")} disparos
                </p>
              </div>
              <span className="whitespace-nowrap text-xs capitalize text-neutral-500">
                {r.status.replace("_", " ")}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500">
                {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
              </span>
              <span className="font-medium text-brand-teal">{formatCurrency(Number(r.calculated_value))}</span>
            </div>
          </div>
        ))}
        {rentals.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white py-8 text-center text-neutral-400">
            Nenhuma locação registrada ainda.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
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
              <tr key={r.id} className="border-b border-neutral-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{formatDate(r.event_date)}</td>
                <td className="px-4 py-3 text-neutral-900">{r.equipments?.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-600">{r.shots.toLocaleString("pt-BR")}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-brand-teal">
                  {formatCurrency(Number(r.calculated_value))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 capitalize">
                  {r.status.replace("_", " ")}
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
    </div>
  );
}
