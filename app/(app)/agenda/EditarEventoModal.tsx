"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ConfirmarExclusaoModal from "@/components/ConfirmarExclusaoModal";
import CalculadoraLocacaoModal from "@/components/CalculadoraLocacaoModal";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { formatDate } from "@/lib/format";
import type { PricingConfig, MentoriaPricingConfig } from "@/lib/rental-pricing";

const EQUIPMENT_LABELS: Record<string, string> = {
  hipro_1: "HIPRO 1",
  hipro_2: "HIPRO 2",
};

interface EventToEdit {
  id: string;
  event_type: string;
  title: string;
  date_start: string;
  status?: string;
  client_id: string | null;
  equipment_id?: string | null;
  rental_id: string | null;
  notes?: string | null;
  clients?: { name: string; whatsapp?: string | null } | null;
  // Estado atual da taxa deste agendamento (nao_aplica/pendente/paga/
  // perdida), repassado direto para a CalculadoraLocacaoModal (mode
  // "finalize") decidir o que oferecer.
  taxa_status?: string | null;
  // Reserva de HIPRO 1/2 marcada como mentoria (leva K) — muda o texto
  // desta tela e faz a CalculadoraLocacaoModal cobrar por paciente modelo
  // em vez de por disparo (leva M/N).
  is_mentoria?: boolean;
}

export default function EditarEventoModal({
  event,
  clients,
  pricingConfig,
  reservationFee,
  mentoriaPricing,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: EventToEdit;
  clients: ClientOption[];
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  mentoriaPricing?: MentoriaPricingConfig;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const isRentalEvent = !!event.rental_id;
  const isPendingReservation = !isRentalEvent && !!event.equipment_id && (event.status ?? "pre_reserva") === "pre_reserva";

  // Todos os hooks ficam aqui em cima, antes de qualquer return condicional
  // (regras de hooks do React: mesma quantidade e ordem em toda renderização,
  // independente de qual ramo — pendente, locação ou evento genérico — está
  // sendo mostrado). Cada ramo só usa o subconjunto que precisa.
  const [showFinalize, setShowFinalize] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [eventType, setEventType] = useState(event.event_type === "hipro_1" || event.event_type === "hipro_2" ? "outros" : event.event_type);
  const [title, setTitle] = useState(event.title);
  const [localClients, setLocalClients] = useState(clients);
  const [clientId, setClientId] = useState(event.client_id ?? "");
  const [dateStart, setDateStart] = useState(event.date_start);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  async function handleCancelReservation() {
    if (!window.confirm("Cancelar esta reserva? O equipamento fica livre nessa data de novo.")) return;
    setCancelling(true);
    setCancelError(null);
    const { error } = await supabase.from("calendar_events").update({ status: "cancelada" }).eq("id", event.id);
    setCancelling(false);
    if (error) {
      setCancelError("Não foi possível cancelar. Tente novamente.");
      return;
    }
    onDeleted();
  }

  if (isPendingReservation) {
    if (showFinalize) {
      return (
        <CalculadoraLocacaoModal
          mode={{
            kind: "finalize",
            reservation: {
              id: event.id,
              clientId: event.client_id ?? "",
              clientName: event.clients?.name ?? "Cliente",
              clientWhatsapp: event.clients?.whatsapp ?? null,
              taxaStatus: event.taxa_status,
              equipmentName: EQUIPMENT_LABELS[event.event_type] ?? event.event_type,
              eventDate: event.date_start,
            },
            isMentoria: event.is_mentoria ?? false,
          }}
          pricingConfig={pricingConfig}
          reservationFee={reservationFee}
          mentoriaPricing={mentoriaPricing}
          onClose={() => setShowFinalize(false)}
          onDone={onSaved}
        />
      );
    }

    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {event.is_mentoria ? "Mentoria pendente" : "Reserva pendente"}
          </h2>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            {EQUIPMENT_LABELS[event.event_type] ?? event.event_type} · {formatDate(event.date_start)}
            {event.clients?.name ? ` · ${event.clients.name}` : ""}
            <br />
            {event.is_mentoria
              ? "Ainda sem cobrança lançada. Finalize com a quantidade de pacientes modelo quando a mentoria acontecer, ou cancele se não for mais rolar."
              : "Ainda sem contagem de disparos. Finalize quando o procedimento acontecer, ou cancele se não for mais rolar."}
          </p>

          {cancelError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{cancelError}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Fechar
            </button>
            <button
              onClick={() => setShowFinalize(true)}
              className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
            >
              {event.is_mentoria ? "Finalizar mentoria" : "Finalizar com disparos"}
            </button>
          </div>

          <button
            onClick={handleCancelReservation}
            disabled={cancelling}
            className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
          >
            {cancelling ? "Cancelando..." : "Cancelar reserva"}
          </button>
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!title.trim() || !dateStart) {
      setError("Informe o título e a data.");
      return;
    }
    if (!window.confirm("Salvar essas alterações no evento?")) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("calendar_events")
      .update({
        event_type: eventType,
        title: title.trim(),
        client_id: clientId || null,
        date_start: dateStart,
        date_end: dateStart,
        notes: notes || null,
      })
      .eq("id", event.id);
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSaved();
  }

  if (isRentalEvent) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{event.title}</h2>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Este evento veio de uma locação HIPRO. Para editar cliente, data, equipamento, disparos ou valor, isso é
            feito na própria locação (na ficha do cliente), para manter o financeiro e a agenda sincronizados.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Fechar
            </button>
            {event.client_id && (
              <Link
                href={`/clientes/${event.client_id}`}
                className="flex-1 rounded-xl bg-brand-teal py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-teal-dark"
              >
                Ir para a locação
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar evento</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Tipo</label>
            <select
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="mentoria">Mentoria</option>
              <option value="outros">Outro</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <ClientPicker
            clients={localClients}
            value={clientId}
            onChange={setClientId}
            onClientCreated={(c) => setLocalClients((prev) => [...prev, c])}
            optional
          />

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <button
          onClick={() => setConfirmarExclusao(true)}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/50 dark:text-red-400"
        >
          Excluir evento
        </button>

        {/* Evento que pertence a uma locação faz a exclusão subir para a
            locação inteira, com o lançamento financeiro junto. A prévia
            avisa isso antes de confirmar. */}
        {confirmarExclusao && (
          <ConfirmarExclusaoModal
            table="calendar_events"
            id={event.id}
            onCancel={() => setConfirmarExclusao(false)}
            onDeleted={() => {
              setConfirmarExclusao(false);
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}
