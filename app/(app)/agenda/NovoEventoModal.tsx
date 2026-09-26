"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";

export default function NovoEventoModal({
  clients,
  defaultDate,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  defaultDate?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [localClients, setLocalClients] = useState(clients);
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState("");
  const [dateStart, setDateStart] = useState(defaultDate ?? (() => new Date().toISOString().slice(0, 10))());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || !dateStart) {
      setError("Informe o título e a data.");
      return;
    }
    setSaving(true);
    setError(null);
    // Este modal é só para compromisso sem equipamento (event_type
    // "outros"). Mentoria sempre usa HIPRO 1 ou HIPRO 2, então sempre
    // passa por "Reservar HIPRO" (ver ReservarHiproModal, campo
    // is_mentoria) — isso garante o bloqueio de agenda pela constraint
    // no_equipment_double_booking. Não oferecer "Mentoria" aqui evita
    // criar um evento que parece agendado mas não trava o equipamento.
    const { error } = await supabase.from("calendar_events").insert({
      event_type: "outros",
      title: title.trim(),
      client_id: clientId || null,
      date_start: dateStart,
      date_end: dateStart,
      status: "confirmada",
      notes: notes || null,
    });
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Novo evento</h2>
        <p className="mb-4 text-xs text-neutral-400">
          Para HIPRO 1, HIPRO 2 ou mentoria (que também usa o equipamento), use "Reservar HIPRO" — isso trava a
          data no equipamento e evita conflito de agenda. Use este aqui só para compromisso que não depende de
          nenhum HIPRO.
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Reunião, visita técnica..."
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
      </div>
    </div>
  );
}
