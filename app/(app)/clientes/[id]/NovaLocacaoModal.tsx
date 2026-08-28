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

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

export default function NovaLocacaoModal({
  clientId,
  equipments,
  onClose,
  onCreated,
}: {
  clientId: string;
  equipments: EquipmentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [equipmentId, setEquipmentId] = useState(equipments[0]?.id ?? "");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shots, setShots] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shotsNumber = Number(shots.replace(/\D/g, ""));
  const pricing = useMemo(() => {
    if (!shotsNumber || shotsNumber <= 0) return null;
    try {
      return calculateRentalValue(shotsNumber);
    } catch {
      return null;
    }
  }, [shotsNumber]);

  async function handleSave() {
    if (!equipmentId || !eventDate || !pricing) {
      setError("Preencha o equipamento, a data e a quantidade de disparos.");
      return;
    }
    setSaving(true);
    setError(null);

    const { error: rpcError } = await supabase.rpc("create_rental", {
      p_client_id: clientId,
      p_equipment_id: equipmentId,
      p_event_date: eventDate,
      p_shots: shotsNumber,
      p_calculated_value: pricing.totalValue,
      p_payment_method: paymentMethod,
      p_notes: notes || null,
    });

    setSaving(false);

    if (rpcError) {
      if (rpcError.code === "23P01") {
        const equipmentName = equipments.find((e) => e.id === equipmentId)?.name ?? "equipamento";
        setError(`⚠️ O ${equipmentName} já está reservado neste período.`);
      } else {
        setError("Não foi possível salvar a locação. Tente novamente.");
      }
      return;
    }

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900">Nova locação</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Equipamento</label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Data</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Quantidade de disparos</label>
            <input
              inputMode="numeric"
              value={shots}
              onChange={(e) => setShots(e.target.value)}
              placeholder="Ex: 45000"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {pricing && (
            <div className="rounded-xl bg-brand-teal/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Valor calculado</span>
                <span className="font-semibold text-brand-teal">{formatCurrency(pricing.totalValue)}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Pacote fixo até 20.000: {formatCurrency(pricing.flatPackageValue)}
                {pricing.tier2Portion > 0 && ` · +${pricing.tier2Portion.toLocaleString("pt-BR")} a R$0,10`}
                {pricing.tier3Portion > 0 && ` · +${pricing.tier3Portion.toLocaleString("pt-BR")} a R$0,07`}
              </p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Forma de pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <p className="mt-3 text-xs text-neutral-400">
          Ao salvar, a locação, a entrada financeira e o evento na agenda são criados automaticamente.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !pricing}
            className="flex-1 rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white transition hover:bg-brand-teal-dark disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
