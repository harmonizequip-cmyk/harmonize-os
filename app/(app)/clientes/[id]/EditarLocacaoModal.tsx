"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateRentalValue } from "@/lib/rental-pricing";
import { formatCurrency } from "@/lib/format";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

const STATUS_OPTIONS = [
  { value: "pre_reserva", label: "Pré-reserva" },
  { value: "confirmada", label: "Confirmada" },
  { value: "realizada", label: "Realizada" },
  { value: "cancelada", label: "Cancelada" },
];

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

interface RentalToEdit {
  id: string;
  equipment_id: string;
  event_date: string;
  shots: number;
  calculated_value: number;
  payment_method: string;
  status: string;
  notes: string | null;
}

export default function EditarLocacaoModal({
  rental,
  equipments,
  onClose,
  onSaved,
}: {
  rental: RentalToEdit;
  equipments: EquipmentOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [equipmentId, setEquipmentId] = useState(rental.equipment_id);
  const [eventDate, setEventDate] = useState(rental.event_date);
  const [shots, setShots] = useState(String(rental.shots));
  const [valor, setValor] = useState(String(rental.calculated_value));
  const [paymentMethod, setPaymentMethod] = useState(rental.payment_method);
  const [status, setStatus] = useState(rental.status);
  const [notes, setNotes] = useState(rental.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shotsNumber = Number(shots.replace(/\D/g, ""));

  const suggestedValue = useMemo(() => {
    if (!shotsNumber || shotsNumber <= 0) return null;
    try {
      return calculateRentalValue(shotsNumber).totalValue;
    } catch {
      return null;
    }
  }, [shotsNumber]);

  function usarValorSugerido() {
    if (suggestedValue !== null) setValor(String(suggestedValue));
  }

  async function handleSave() {
    const valorNumber = Number(valor.replace(",", "."));
    if (!equipmentId || !eventDate || !shotsNumber || !valorNumber) {
      setError("Preencha equipamento, data, disparos e valor.");
      return;
    }
    if (!window.confirm("Salvar essas alterações na locação?")) return;
    setSaving(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("update_rental", {
      p_rental_id: rental.id,
      p_equipment_id: equipmentId,
      p_event_date: eventDate,
      p_shots: shotsNumber,
      p_calculated_value: valorNumber,
      p_payment_method: paymentMethod,
      p_status: status,
      p_notes: notes || null,
    });

    setSaving(false);

    if (rpcError) {
      if (rpcError.code === "23P01") {
        setError("⚠️ Esse equipamento já está reservado nessa data.");
      } else {
        setError("Não foi possível salvar. Tente novamente.");
      }
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 dark:bg-neutral-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar locação</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Equipamento</label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Disparos</label>
            <input
              inputMode="numeric"
              value={shots}
              onChange={(e) => setShots(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor final</label>
              {suggestedValue !== null && (
                <button
                  type="button"
                  onClick={usarValorSugerido}
                  className="text-xs text-brand-teal underline underline-offset-2"
                >
                  Usar sugerido: {formatCurrency(suggestedValue)}
                </button>
              )}
            </div>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Editável à parte, já que cobranças adicionais e descontos aplicados na criação não ficam guardados separadamente.
            </p>
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
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
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
