"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatCurrency, formatDate, buildMapsLink, buildWazeLink, buildWhatsAppLink } from "@/lib/format";
import type { PricingConfig } from "@/lib/rental-pricing";
import CalculadoraLocacaoModal from "@/components/CalculadoraLocacaoModal";
import EditarClienteModal from "./EditarClienteModal";
import EditarLocacaoModal from "./EditarLocacaoModal";
import ReservarHiproModal from "../../agenda/ReservarHiproModal";
import HistoricoClienteSection from "./HistoricoClienteSection";

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
  address: string | null;
  notes: string | null;
  parceiro?: boolean;
  treatment?: string | null;
  display_name?: string | null;
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

// Abre um link numa aba nova. Eram tags de link comuns antes, mas botão
// evita o bloqueio de pop-up herdado, mantém o mesmo visual, e evita a
// tag de link ser corrompida numa aplicação manual via GitHub.
function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export default function ClienteDetailClient({
  client,
  rentals,
  billableCount,
  billableTotal,
  equipments,
  pricingConfig,
  reservationFee,
}: {
  client: Client;
  rentals: RentalRow[];
  // Contagem e soma já calculadas no servidor a partir da view
  // rentals_contabilizaveis (exclui cancelada e modo teste). Não dá pra
  // recalcular aqui a partir de `rentals`, porque essa lista é a do
  // histórico e inclui as canceladas de propósito.
  billableCount: number;
  billableTotal: number;
  equipments: EquipmentOption[];
  pricingConfig?: PricingConfig;
  reservationFee?: number;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [reservaOpen, setReservaOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<RentalRow | null>(null);

  const totalLocacoes = rentals.length;
  // Faturado e ticket médio saem da contagem contabilizável, não do
  // tamanho da lista do histórico. Locação cancelada continua aparecendo
  // na tabela abaixo, mas não entra em nenhum dos dois números.
  const totalFaturado = billableTotal;
  const ticketMedio = billableCount > 0 ? billableTotal / billableCount : 0;
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
        <div className="flex gap-2">
          <button
            onClick={() => setReservaOpen(true)}
            className="rounded-xl border border-brand-teal px-4 py-2.5 text-sm font-medium text-brand-teal transition active:scale-[0.98]"
          >
            Agendar sem disparos
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
          >
            + Nova locação
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55 sm:grid-cols-4">
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
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Endereço</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{client.address ?? "-"}</p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Observação</p>
          <p className="mt-0.5 text-sm text-neutral-900 dark:text-neutral-100">{client.notes ?? "-"}</p>
        </div>

        {(client.whatsapp || client.address) && (
          <div className="col-span-2 flex gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:col-span-4">
            {buildWhatsAppLink(client.whatsapp) && (
              <button
                type="button"
                onClick={() => openInNewTab(buildWhatsAppLink(client.whatsapp)!)}
                className="flex-1 rounded-lg bg-brand-teal/10 py-2 text-center text-xs font-medium text-brand-teal"
              >
                Abrir WhatsApp
              </button>
            )}
            {buildMapsLink(client.address) && (
              <button
                type="button"
                onClick={() => openInNewTab(buildMapsLink(client.address)!)}
                className="flex-1 rounded-lg bg-brand-blue/10 py-2 text-center text-xs font-medium text-brand-blue"
              >
                Abrir no Maps
              </button>
            )}
            {buildWazeLink(client.address) && (
              <button
                type="button"
                onClick={() => openInNewTab(buildWazeLink(client.address)!)}
                className="flex-1 rounded-lg bg-brand-lilac/10 py-2 text-center text-xs font-medium text-brand-lilac"
              >
                Abrir no Waze
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Total de locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{totalLocacoes}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Total faturado</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(totalFaturado)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(ticketMedio)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
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
        {/* A taxa de cada data aparece na lista de Agendamentos, abaixo,
            com os botões para mexer nela. Aqui em cima fica só o que é do
            cliente: se ele é parceiro e por isso nunca paga. */}
        {client.parceiro && (
          <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-medium text-brand-blue">
            🤝 Parceiro · reserva sem taxa
          </span>
        )}
      </div>

      {/* Celular: cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {rentals.map((r) => (
          <div
            key={r.id}
            onClick={() => setEditingRental(r)}
            className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55"
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
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            Nenhuma locação registrada ainda.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55 sm:block">
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

      <HistoricoClienteSection clientId={client.id} />

      {modalOpen && (
        <CalculadoraLocacaoModal
          mode={{
            kind: "create",
            clientId: client.id,
            clientName: client.name,
            clientWhatsapp: client.whatsapp,
            clientParceiro: client.parceiro,
            equipments,
          }}
          pricingConfig={pricingConfig}
          reservationFee={reservationFee}
          onClose={() => setModalOpen(false)}
          onDone={handleCreated}
        />
      )}

      {reservaOpen && (
        <ReservarHiproModal
          clients={[]}
          equipments={equipments}
          fixedClientId={client.id}
          fixedClientName={client.name}
          onClose={() => setReservaOpen(false)}
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
          onDeleted={() => {
            // O registro deixou de existir: router.refresh() quebraria
            // esta página (ela busca este cliente no servidor). Sai pra
            // lista em vez de tentar recarregar aqui.
            router.push("/clientes");
          }}
        />
      )}

      {editingRental && (
        <EditarLocacaoModal
          rental={editingRental}
          equipments={equipments}
          pricingConfig={pricingConfig}
          currentClientId={client.id}
          currentClientName={client.name}
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
