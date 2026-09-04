"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ConfirmPinModal from "@/components/ConfirmPinModal";

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

interface TransactionToEdit {
  id: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  payment_method: string;
  date: string;
  category_id: string | null;
  client_id: string | null;
}

export default function EditarLancamentoModal({
  transaction,
  categories,
  clients,
  onClose,
  onSaved,
  onDeleted,
}: {
  transaction: TransactionToEdit;
  categories: CategoryRow[];
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const [type, setType] = useState<"entrada" | "saida">(transaction.type);
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [clientId, setClientId] = useState(transaction.client_id ?? "");
  const [paymentMethod, setPaymentMethod] = useState(transaction.payment_method);
  const [date, setDate] = useState(transaction.date);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeletePin, setShowDeletePin] = useState(false);

  const categoriasDoTipo = categories.filter((c) => c.type === type);

  async function handleSave() {
    const amountNumber = Number(amount.replace(",", "."));
    if (!description.trim() || !amountNumber || !date) {
      setError("Preencha descrição, valor e data.");
      return;
    }
    if (!window.confirm("Salvar essas alterações no lançamento?")) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("transactions")
      .update({
        type,
        description: description.trim(),
        amount: amountNumber,
        category_id: categoryId || null,
        client_id: clientId || null,
        payment_method: paymentMethod,
        date,
      })
      .eq("id", transaction.id);
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const { error } = await supabase.from("transactions").delete().eq("id", transaction.id);
    setDeleting(false);
    if (error) {
      setError("Não foi possível excluir. Tente novamente.");
      return;
    }
    onDeleted();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar lançamento</h2>

        <div className="mb-3 flex gap-2">
          {(["entrada", "saida"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
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
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor</label>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Sem categoria</option>
              {categoriasDoTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
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
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
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
          onClick={() => setShowDeletePin(true)}
          disabled={deleting}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
        >
          {deleting ? "Excluindo..." : "Excluir lançamento"}
        </button>

        {showDeletePin && (
          <ConfirmPinModal
            title="Confirme com a senha para excluir"
            confirmLabel="Excluir"
            danger
            onConfirm={() => {
              setShowDeletePin(false);
              handleDelete();
            }}
            onCancel={() => setShowDeletePin(false)}
          />
        )}
      </div>
    </div>
  );
}
