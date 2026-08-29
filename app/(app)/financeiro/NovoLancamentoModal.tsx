"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

interface CategoryRow {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

interface ClientOption {
  id: string;
  name: string;
}

export default function NovoLancamentoModal({
  categories,
  clients,
  onClose,
  onCreated,
}: {
  categories: CategoryRow[];
  clients: ClientOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [type, setType] = useState<"entrada" | "saida">("entrada");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [clientId, setClientId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredCategories = categories.filter((c) => c.type === type);

  async function handleSave() {
    const numericAmount = Number(amount.replace(",", "."));
    if (!categoryId || !description || !amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Preencha categoria, descrição e um valor válido.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("transactions").insert({
      type,
      category_id: categoryId,
      description,
      amount: numericAmount,
      client_id: clientId || null,
      payment_method: paymentMethod,
      date,
      notes: notes || null,
      scope: "harmonize",
    });
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Novo lançamento</h2>

        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["entrada", "saida"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setCategoryId("");
              }}
              className={`rounded-xl py-2.5 text-sm font-medium transition ${
                type === t
                  ? t === "entrada"
                    ? "bg-brand-teal text-white"
                    : "bg-brand-pink text-white"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {t === "entrada" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Selecione</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor (R$)</label>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Cliente (opcional — deslocamento, etc.)
            </label>
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
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Forma de pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
      </div>
    </div>
  );
}
