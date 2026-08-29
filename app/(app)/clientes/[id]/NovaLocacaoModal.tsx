"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateRentalValue, RESERVATION_FEE } from "@/lib/rental-pricing";
import {
  buildWhatsAppSummary,
  buildWhatsAppLink,
  calculateTotals,
  type ReservationFeeStatus,
} from "@/lib/rental-summary";
import { formatCurrency } from "@/lib/format";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

const RESERVATION_OPTIONS: { value: ReservationFeeStatus; label: string }[] = [
  { value: "nao_aplica", label: "Não se aplica" },
  { value: "ja_paga", label: "Já foi paga (creditar no total)" },
  { value: "cobrar_agora", label: "Cobrar agora (R$ 250)" },
];

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

export default function NovaLocacaoModal({
  clientId,
  clientName,
  clientWhatsapp,
  equipments,
  onClose,
  onCreated,
}: {
  clientId: string;
  clientName: string;
  clientWhatsapp?: string | null;
  equipments: EquipmentOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [equipmentId, setEquipmentId] = useState(equipments[0]?.id ?? "");
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [initialCount, setInitialCount] = useState("");
  const [finalCount, setFinalCount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");

  const [showExtras, setShowExtras] = useState(false);
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [additionalValue, setAdditionalValue] = useState("");
  const [discountDescription, setDiscountDescription] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  const [reservationFeeStatus, setReservationFeeStatus] = useState<ReservationFeeStatus>("nao_aplica");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewCopied, setPreviewCopied] = useState(false);

  const initialNumber = Number(initialCount.replace(/\D/g, ""));
  const finalNumber = Number(finalCount.replace(/\D/g, ""));
  const shots = finalCount && initialCount ? finalNumber - initialNumber : 0;
  const additionalNumber = Number(additionalValue.replace(",", ".")) || 0;
  const discountNumber = Number(discountValue.replace(",", ".")) || 0;

  const pricing = useMemo(() => {
    if (!shots || shots <= 0) return null;
    try {
      return calculateRentalValue(shots);
    } catch {
      return null;
    }
  }, [shots]);

  const totals = useMemo(() => {
    if (!pricing) return null;
    return calculateTotals({
      initialCount: initialNumber,
      finalCount: finalNumber,
      pricing,
      additionalChargeValue: additionalNumber,
      additionalChargeDescription: additionalDescription,
      discountValue: discountNumber,
      discountDescription,
      reservationFeeStatus,
      eventDate,
      clientName,
      paymentMethod,
    });
  }, [pricing, initialNumber, finalNumber, additionalNumber, additionalDescription, discountNumber, discountDescription, reservationFeeStatus, eventDate, clientName, paymentMethod]);

  const previewSummary = useMemo(() => {
    if (!pricing) return null;
    return buildWhatsAppSummary({
      initialCount: initialNumber,
      finalCount: finalNumber,
      pricing,
      additionalChargeValue: additionalNumber,
      additionalChargeDescription: additionalDescription,
      discountValue: discountNumber,
      discountDescription,
      reservationFeeStatus,
      eventDate,
      clientName,
      paymentMethod,
    });
  }, [pricing, initialNumber, finalNumber, additionalNumber, additionalDescription, discountNumber, discountDescription, reservationFeeStatus, eventDate, clientName, paymentMethod]);

  const previewWhatsappLink = previewSummary ? buildWhatsAppLink(clientWhatsapp, previewSummary) : null;

  async function handleCopyPreview() {
    if (!previewSummary) return;
    try {
      await navigator.clipboard.writeText(previewSummary);
      setPreviewCopied(true);
      setTimeout(() => setPreviewCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  async function handleSave() {
    if (!equipmentId || !eventDate) {
      setError("Preencha o equipamento e a data.");
      return;
    }
    if (!initialCount || !finalCount) {
      setError("Preencha a contagem inicial e final do equipamento.");
      return;
    }
    if (finalNumber <= initialNumber) {
      setError("A contagem final precisa ser maior que a inicial.");
      return;
    }
    if (!pricing || !totals) {
      setError("Não foi possível calcular o valor. Confira as contagens.");
      return;
    }

    setSaving(true);
    setError(null);
    setWarning(null);

    const { data: rentalId, error: rpcError } = await supabase.rpc("create_rental", {
      p_client_id: clientId,
      p_equipment_id: equipmentId,
      p_event_date: eventDate,
      p_shots: shots,
      p_calculated_value: totals.rentalTransactionAmount,
      p_payment_method: paymentMethod,
      p_notes: notes || null,
    });

    if (rpcError) {
      setSaving(false);
      if (rpcError.code === "23P01") {
        const equipmentName = equipments.find((e) => e.id === equipmentId)?.name ?? "equipamento";
        setError(`⚠️ O ${equipmentName} já está reservado neste período.`);
      } else {
        setError("Não foi possível salvar a locação. Tente novamente.");
      }
      return;
    }

    // Taxa de reserva cobrada agora vira uma transação própria, separada da
    // locação, para ficar categorizada como "Taxa de reserva" no financeiro.
    if (reservationFeeStatus === "cobrar_agora") {
      const { data: category } = await supabase
        .from("categories")
        .select("id")
        .eq("type", "entrada")
        .ilike("name", "Taxa%")
        .limit(1)
        .single();

      if (category) {
        const { error: feeError } = await supabase.from("transactions").insert({
          type: "entrada",
          category_id: category.id,
          description: `Taxa de reserva - ${clientName}`,
          amount: RESERVATION_FEE,
          payment_method: paymentMethod,
          date: eventDate,
          scope: "harmonize",
          client_id: clientId,
          rental_id: rentalId,
        });
        if (feeError) {
          setWarning("A locação foi salva, mas a taxa de reserva não foi registrada automaticamente. Adicione manualmente em Financeiro.");
        }
      } else {
        setWarning("A locação foi salva, mas não encontrei a categoria 'Taxa de reserva' para registrar automaticamente.");
      }
    }

    setSaving(false);
    setSummary(
      buildWhatsAppSummary({
        initialCount: initialNumber,
        finalCount: finalNumber,
        pricing,
        additionalChargeValue: additionalNumber,
        additionalChargeDescription: additionalDescription,
        discountValue: discountNumber,
        discountDescription,
        reservationFeeStatus,
        eventDate,
        clientName,
        paymentMethod,
      })
    );
  }

  async function handleCopy() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  const whatsappLink = summary ? buildWhatsAppLink(clientWhatsapp, summary) : null;

  // Tela de sucesso: locação já salva, mostra o resumo para copiar/enviar
  if (summary) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
          <h2 className="mb-1 text-lg font-semibold text-neutral-900">Locação salva ✅</h2>
          <p className="mb-2 text-sm text-neutral-500">Copie o resumo abaixo ou envie direto no WhatsApp.</p>
          {warning && <p className="mb-3 text-xs text-amber-600">{warning}</p>}

          <pre className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700">
            {summary}
          </pre>

          <div className="mt-4 flex flex-col gap-2">
            {whatsappLink && (
              <a
                href={whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-brand-teal py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-teal-dark"
              >
                Enviar no WhatsApp
              </a>
            )}
            <button
              onClick={handleCopy}
              className="rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
            >
              {copied ? "Copiado!" : "Copiar texto"}
            </button>
            <button
              onClick={onCreated}
              className="rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white"
            >
              Concluir
            </button>
          </div>
        </div>
      </div>
    );
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Contagem inicial</label>
              <input
                inputMode="numeric"
                value={initialCount}
                onChange={(e) => setInitialCount(e.target.value)}
                placeholder="Ex: 2907661"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Contagem final</label>
              <input
                inputMode="numeric"
                value={finalCount}
                onChange={(e) => setFinalCount(e.target.value)}
                placeholder="Ex: 2942213"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          {shots > 0 && (
            <p className="text-xs text-neutral-500">
              Disparos realizados: <span className="font-medium text-neutral-700">{shots.toLocaleString("pt-BR")}</span>
            </p>
          )}

          {pricing && (
            <div className="rounded-xl bg-brand-teal/10 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-neutral-600">Valor dos disparos</span>
                <span className="font-semibold text-brand-teal">{formatCurrency(pricing.totalValue)}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Pacote fixo até 20.000: {formatCurrency(pricing.flatPackageValue)}
                {pricing.tier2Portion > 0 && ` · +${pricing.tier2Portion.toLocaleString("pt-BR")} a R$0,10`}
                {pricing.tier3Portion > 0 && ` · +${pricing.tier3Portion.toLocaleString("pt-BR")} a R$0,07`}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowExtras((v) => !v)}
            className="text-xs font-medium text-brand-teal underline underline-offset-2"
          >
            {showExtras ? "Ocultar cobranças adicionais, desconto e taxa de reserva" : "+ Cobrança adicional, desconto ou taxa de reserva"}
          </button>

          {showExtras && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Cobrança adicional</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={additionalDescription}
                    onChange={(e) => setAdditionalDescription(e.target.value)}
                    placeholder="Ex: Deslocamento"
                    className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <input
                    inputMode="decimal"
                    value={additionalValue}
                    onChange={(e) => setAdditionalValue(e.target.value)}
                    placeholder="R$ 0,00"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Desconto</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={discountDescription}
                    onChange={(e) => setDiscountDescription(e.target.value)}
                    placeholder="Ex: Fidelidade"
                    className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <input
                    inputMode="decimal"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder="R$ 0,00"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Taxa de reserva (R$ 250)</label>
                <select
                  value={reservationFeeStatus}
                  onChange={(e) => setReservationFeeStatus(e.target.value as ReservationFeeStatus)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                >
                  {RESERVATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {totals && (
            <div className="rounded-xl bg-neutral-900 p-3 text-sm text-white">
              <div className="flex items-center justify-between">
                <span>Total a pagar agora</span>
                <span className="text-lg font-semibold">{formatCurrency(totals.totalToPayNow)}</span>
              </div>
            </div>
          )}

          {previewSummary && (
            <div className="flex gap-2">
              {previewWhatsappLink && (
                <a
                  href={previewWhatsappLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-xl border border-brand-teal py-2 text-center text-xs font-medium text-brand-teal"
                >
                  Enviar orçamento no WhatsApp
                </a>
              )}
              <button
                type="button"
                onClick={handleCopyPreview}
                className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600"
              >
                {previewCopied ? "Copiado!" : "Copiar orçamento"}
              </button>
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
