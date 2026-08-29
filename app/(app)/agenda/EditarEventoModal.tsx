"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface ClientOption {
  id: string;
  name: string;
}

interface EventToEdit {
  id: string;
  event_type: string;
  title: string;
  date_start: string;
  client_id: string | null;
  rental_id: string | null;
  notes?: string | null;
}

export default function EditarEventoModal({
  event,
  clients,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: EventToEdit;
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const isRentalEvent = !!event.rental_id;

  const [eventType, setEventType] = useState(event.event_type === "hipro_1" || event.event_type === "hipro_2" ? "outros" : event.event_type);
  const [title, setTitle] = useState(event.title);
  const [clientId, setClientId] = useState(event.client_id ?? "");
  const [dateStart, setDateStart] = useState(event.date_start);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || !dateStart) {
      setError("Informe o título e a data.");
      return;
    }
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

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from("calendar_events").delete().eq("id", event.id);
    setDeleting(false);
    if (error) {
      setError("Não foi possível excluir. Tente novamente.");
      return;
    }
    onDeleted();
  }

  if (isRentalEvent) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-t-2xl bg-white p-6 dark:bg-neutral-900 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{event.title}</h2>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Este evento veio de uma locação HIPRO. Para editar data, equipamento, disparos ou valor, isso é feito na
            própria locação, para manter o financeiro e a agenda sincronizados.
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 dark:bg-neutral-900 sm:rounded-2xl"
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

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Cliente (opcional)</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Nenhum</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

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
            className="flex-1 rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white transition hover:bg-brand-teal-dark disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>

        <button
          onClick={handleDelete}
          disabled={deleting}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
        >
          {deleting ? "Excluindo..." : confirmDelete ? "Toque de novo para confirmar" : "Excluir evento"}
        </button>
      </div>
    </div>
  );
}
