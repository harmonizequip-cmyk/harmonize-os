"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LeadRow } from "./FunilClient";

// Modal único, usado em dois lugares: solto no painel de tarefas do Funil
// (aí "leads" vem preenchido e a pessoa escolhe o cliente numa lista, ou
// deixa "Nenhum" pra criar uma tarefa solta) e dentro da ficha de um lead
// (aí vem "lockedClientId"/"lockedClientName" e o cliente já fica fixo,
// sem lista pra escolher).
export default function NovaTarefaModal({
  leads = [],
  lockedClientId,
  lockedClientName,
  onClose,
  onCreated,
}: {
  leads?: LeadRow[];
  lockedClientId?: string;
  lockedClientName?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(lockedClientId ?? "");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedLeads = [...leads].sort((a, b) => a.name.localeCompare(b.name));

  async function handleSave() {
    if (!title.trim()) {
      setError("Escreva o que precisa ser feito.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("tasks").insert({
      client_id: clientId || null,
      type: "manual",
      title: title.trim(),
      due_date: dueDate,
    });
    setSaving(false);
    if (insertError) {
      setError("Não foi possível criar a tarefa. Tente novamente.");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Nova tarefa</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              O que precisa ser feito
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Ligar pra confirmar o endereço"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Cliente (opcional)
            </label>
            {lockedClientId ? (
              <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {lockedClientName}
              </p>
            ) : (
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                <option value="">Nenhum (tarefa solta)</option>
                {sortedLeads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
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
