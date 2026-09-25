"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateRentalValue, RESERVATION_FEE, type PricingConfig } from "@/lib/rental-pricing";
import {
  buildWhatsAppSummary,
  buildWhatsAppLink,
  calculateTotals,
  type ReservationFeeStatus,
} from "@/lib/rental-summary";
import { formatCurrency, formatDate } from "@/lib/format";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

export interface ReservationToFinalize {
  id: string; // id do calendar_events
  clientId: string;
  clientName: string;
  clientWhatsapp?: string | null;
  // Estado ATUAL da taxa deste agendamento (calendar_events.taxa_status:
  // nao_aplica/pendente/paga/perdida). Nasceu sozinho ao criar a pré-reserva
  // (ver definir_taxa_ao_criar_evento) ou foi mudado pelos botões de status
  // na ficha do cliente — é a fonte da verdade, não um campo do cliente.
  taxaStatus?: string | null;
  equipmentName: string;
  eventDate: string; // date_start, YYYY-MM-DD
}

// Abre o link do WhatsApp numa aba nova. Era uma tag de link comum antes,
// mas botão evita o bloqueio de pop-up herdado e mantém o mesmo visual.
function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export default function FinalizarReservaModal({
  reservation,
  pricingConfig,
  reservationFee,
  onClose,
  onFinalized,
}: {
  reservation: ReservationToFinalize;
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  onClose: () => void;
  onFinalized: () => void;
}) {
  const supabase = createClient();
  const fee = reservationFee ?? RESERVATION_FEE;
  // taxa_status é a fonte da verdade deste agendamento específico, não um
  // campo do cliente. "paga" só é possível se alguém já marcou como paga
  // pela ficha do cliente antes de finalizar — nesse caso o valor já virou
  // um lançamento próprio e só falta creditar contra o total desta locação.
  const feeIsPaid = reservation.taxaStatus === "paga";
  const feePending = reservation.taxaStatus === "pendente";

  const [initialCount, setInitialCount] = useState("");
  const [finalCount, setFinalCount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [notes, setNotes] = useState("");

  const [showExtras, setShowExtras] = useState(feeIsPaid || feePending);
  const [additionalDescription, setAdditionalDescription] = useState("");
  const [additionalValue, setAdditionalValue] = useState("");
  const [discountDescription, setDiscountDescription] = useState("");
  const [discountValue, setDiscountValue] = useState("");
  // "valor" = discountValue já é reais. "percentual" = discountValue é uma
  // porcentagem (0-100) sobre o valor dos disparos (pricing.totalValue),
  // convertida pra reais em discountNumber logo abaixo.
  const [discountType, setDiscountType] = useState<"valor" | "percentual">("valor");
  // Só existe decisão a tomar quando a taxa está pendente: cobrar agora ou
  // deixar pendente pra depois. Paga já é fato consumado (credita sozinha)
  // e nao_aplica/perdida não têm o que oferecer aqui.
  const [chargeFeeNow, setChargeFeeNow] = useState(false);
  const reservationFeeStatus: ReservationFeeStatus = feeIsPaid
    ? "ja_paga"
    : feePending && chargeFeeNow
    ? "cobrar_agora"
    : "nao_aplica";

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const initialNumber = Number(initialCount.replace(/\D/g, ""));
  const finalNumber = Number(finalCount.replace(/\D/g, ""));
  const shots = finalCount && initialCount ? finalNumber - initialNumber : 0;
  const additionalNumber = Number(additionalValue.replace(",", ".")) || 0;

  const pricing = useMemo(() => {
    if (!shots || shots <= 0) return null;
    try {
      return calculateRentalValue(shots, pricingConfig);
    } catch {
      return null;
    }
  }, [shots, pricingConfig]);

  // Em modo percentual, discountValue guarda o número da porcentagem
  // (ex: "10"), não reais. discountNumber é sempre o valor final em
  // reais, calculado sobre o subtotal dos disparos, é o que entra em
  // calculateTotals/buildWhatsAppSummary, que não sabem de porcentagem.
  const discountRawNumber = Number(discountValue.replace(",", ".")) || 0;
  const discountNumber =
    discountType === "percentual"
      ? pricing
        ? Math.round(pricing.totalValue * (discountRawNumber / 100) * 100) / 100
        : 0
      : discountRawNumber;
  // Se a descrição ficou em branco no modo percentual, o resumo de
  // WhatsApp mostraria só "Desconto: - R$ X" sem dizer que foi 10%.
  // Preenche automaticamente pra deixar isso explícito pro cliente.
  const effectiveDiscountDescription =
    discountType === "percentual" && !discountDescription.trim()
      ? `${discountRawNumber}% de desconto`
      : discountDescription;

  const totals = useMemo(() => {
    if (!pricing) return null;
    return calculateTotals({
      initialCount: initialNumber,
      finalCount: finalNumber,
      pricing,
      additionalChargeValue: additionalNumber,
      additionalChargeDescription: additionalDescription,
      discountValue: discountNumber,
      discountDescription: effectiveDiscountDescription,
      reservationFeeStatus,
      eventDate: reservation.eventDate,
      clientName: reservation.clientName,
      paymentMethod,
      reservationFee: fee,
    });
  }, [pricing, initialNumber, finalNumber, additionalNumber, additionalDescription, discountNumber, effectiveDiscountDescription, reservationFeeStatus, paymentMethod, reservation.eventDate, reservation.clientName, fee]);

  async function handleSave() {
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
    if (!window.confirm("Finalizar esta reserva com essa contagem de disparos? Isso cria a locação e o lançamento financeiro.")) return;

    setSaving(true);
    setError(null);
    setWarning(null);

    const { error: rpcError } = await supabase.rpc("finalize_rental_reservation", {
      p_calendar_event_id: reservation.id,
      p_shots: shots,
      p_calculated_value: totals.rentalTransactionAmount,
      p_payment_method: paymentMethod,
      p_notes: notes || null,
    });

    if (rpcError) {
      setSaving(false);
      setError("Não foi possível finalizar a reserva. Tente novamente.");
      return;
    }

    // Cobrar agora passa pela mesma função que os botões de status usam na
    // ficha do cliente: definir_taxa_agendamento cria o lançamento próprio
    // (categoria "Taxa de reserva", separado da locação) e grava
    // taxa_status/taxa_transaction_id no próprio agendamento — que aqui já
    // temos o id direto (reservation.id), sem precisar procurar. Antes
    // disto era um insert solto em transactions, que fazia o financeiro
    // mostrar a taxa como recebida mas deixava o agendamento mostrando
    // "pendente" para sempre.
    if (reservationFeeStatus === "cobrar_agora") {
      const { error: feeError } = await supabase.rpc("definir_taxa_agendamento", {
        p_event_id: reservation.id,
        p_status: "paga",
        p_payment_method: paymentMethod,
      });
      if (feeError) {
        setWarning("A locação foi finalizada, mas a taxa de reserva não foi registrada automaticamente. Marque como paga na ficha do cliente.");
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
        discountDescription: effectiveDiscountDescription,
        reservationFeeStatus,
        eventDate: reservation.eventDate,
        clientName: reservation.clientName,
        paymentMethod,
        reservationFee: fee,
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

  const whatsappLink = summary ? buildWhatsAppLink(reservation.clientWhatsapp, summary) : null;

  if (summary) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl">
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Locação finalizada ✅</h2>
          <p className="mb-2 text-sm text-neutral-500">Copie o resumo abaixo ou envie direto no WhatsApp.</p>
          {warning && <p className="mb-3 text-xs text-amber-600">{warning}</p>}

          <pre className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {summary}
          </pre>

          <div className="mt-4 flex flex-col gap-2">
            {whatsappLink && (
              <button
                type="button"
                onClick={() => openInNewTab(whatsappLink)}
                className="rounded-xl bg-brand-teal py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-teal-dark"
              >
                Enviar no WhatsApp
              </button>
            )}
            <button
              onClick={handleCopy}
              className="rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
            >
              {copied ? "Copiado!" : "Copiar texto"}
            </button>
            <button
              onClick={onFinalized}
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Finalizar reserva</h2>
        <p className="mb-4 text-xs text-neutral-400">
          {reservation.equipmentName} · {formatDate(reservation.eventDate)} · {reservation.clientName}
        </p>

        {feeIsPaid && (
          <div className="mb-4 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3 text-xs text-brand-teal">
            💳 A taxa de reserva desta data ({formatCurrency(fee)}) já foi paga. Ela entra como crédito no total
            abaixo.
          </div>
        )}
        {feePending && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
            💳 A taxa de reserva desta data está pendente. Marque "Cobrar taxa de reserva agora" abaixo se for cobrar
            junto com esta finalização.
          </div>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Contagem inicial</label>
              <input
                inputMode="numeric"
                value={initialCount}
                onChange={(e) => setInitialCount(e.target.value)}
                placeholder="Ex: 2907661"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Contagem final</label>
              <input
                inputMode="numeric"
                value={finalCount}
                onChange={(e) => setFinalCount(e.target.value)}
                placeholder="Ex: 2942213"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
          </div>

          {shots > 0 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Disparos realizados: <span className="font-medium text-neutral-700 dark:text-neutral-300">{shots.toLocaleString("pt-BR")}</span>
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
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Cobrança adicional</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={additionalDescription}
                    onChange={(e) => setAdditionalDescription(e.target.value)}
                    placeholder="Ex: Deslocamento"
                    className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <input
                    inputMode="decimal"
                    value={additionalValue}
                    onChange={(e) => setAdditionalValue(e.target.value)}
                    placeholder="R$ 0,00"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Desconto</label>
                  <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
                    <button
                      type="button"
                      onClick={() => setDiscountType("valor")}
                      className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                        discountType === "valor"
                          ? "bg-brand-teal text-white"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      R$
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType("percentual")}
                      className={`rounded px-2 py-0.5 text-xs font-medium transition ${
                        discountType === "percentual"
                          ? "bg-brand-teal text-white"
                          : "text-neutral-500 dark:text-neutral-400"
                      }`}
                    >
                      %
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    value={discountDescription}
                    onChange={(e) => setDiscountDescription(e.target.value)}
                    placeholder="Ex: Fidelidade"
                    className="col-span-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <input
                    inputMode="decimal"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    placeholder={discountType === "percentual" ? "Ex: 10" : "R$ 0,00"}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
                {discountType === "percentual" && discountRawNumber > 0 && (
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {discountRawNumber}% sobre o valor dos disparos ({formatCurrency(pricing?.totalValue ?? 0)}) ={" "}
                    {formatCurrency(discountNumber)}
                  </p>
                )}
              </div>

              {feeIsPaid && (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Taxa de reserva já paga ({formatCurrency(fee)}): entra como crédito no total a pagar agora.
                </p>
              )}
              {feePending && (
                <div>
                  <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    <input
                      type="checkbox"
                      checked={chargeFeeNow}
                      onChange={(e) => setChargeFeeNow(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    Cobrar taxa de reserva agora ({formatCurrency(fee)})
                  </label>
                  <p className="mt-1 text-xs text-neutral-400">
                    Deixe desmarcado para manter a taxa pendente e cobrar depois pela ficha do cliente.
                  </p>
                </div>
              )}
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
            disabled={saving || !pricing}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving ? "Salvando..." : "Finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}
