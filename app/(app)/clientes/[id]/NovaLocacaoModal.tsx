"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ClientPicker from "@/components/ClientPicker";
import { calculateRentalValue, RESERVATION_FEE, type PricingConfig } from "@/lib/rental-pricing";
import {
  buildWhatsAppSummary,
  buildWhatsAppLink,
  calculateTotals,
  type ReservationFeeStatus,
} from "@/lib/rental-summary";
import { formatCurrency, formatDate } from "@/lib/format";

interface PendingReservation {
  id: string;
  equipment_id: string | null;
  date_start: string;
  equipmentName: string;
}

// Lista de clientes usada só quando o modal abre sem cliente fixo (menu
// "+" global). Além de id/nome (o que o ClientPicker precisa), carrega
// whatsapp e o status da taxa de reserva, pra pré-selecionar "já paga" ou
// "cobrar agora" assim que a pessoa escolhe o cliente (Pedido 3 da
// auditoria). Cliente cadastrado na hora pelo próprio picker entra sem
// esses dois campos, o formulário cai no padrão de qualquer jeito.
interface ClientWithExtras {
  id: string;
  name: string;
  whatsapp?: string | null;
  reservation_fee_status?: string;
}

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

// Abre o link do WhatsApp numa aba nova. Era uma tag de link comum antes,
// mas botão evita o bloqueio de pop-up herdado e mantém o mesmo visual.
function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export default function NovaLocacaoModal({
  clientId,
  clientName,
  clientWhatsapp,
  clientReservationFeeStatus,
  clients,
  equipments,
  pricingConfig,
  reservationFee,
  onClose,
  onCreated,
}: {
  // Cliente fixo (aberto de dentro da ficha do cliente) ou nenhum dos três,
  // caso em que o modal mostra o ClientPicker (aberto pelo "+" global, sem
  // partir de uma ficha específica, Pedido 1 da auditoria).
  clientId?: string;
  clientName?: string;
  clientWhatsapp?: string | null;
  clientReservationFeeStatus?: string;
  clients?: ClientWithExtras[];
  equipments: EquipmentOption[];
  // Config de preço vinda de settings (ver lib/settings.ts). Se não
  // vier (prop omitida), calculateRentalValue cai no DEFAULT_PRICING
  // interno, que hoje tem exatamente os mesmos valores.
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const fee = reservationFee ?? RESERVATION_FEE;
  const RESERVATION_OPTIONS: { value: ReservationFeeStatus; label: string }[] = [
    { value: "nao_aplica", label: "Não se aplica" },
    { value: "ja_paga", label: "Já foi paga (creditar no total)" },
    { value: "cobrar_agora", label: `Cobrar agora (${formatCurrency(fee)})` },
  ];

  const isFixedClient = !!clientId;
  const [localClientList, setLocalClientList] = useState<ClientWithExtras[]>(clients ?? []);
  const [pickedClientId, setPickedClientId] = useState("");
  const pickedClient = localClientList.find((c) => c.id === pickedClientId);
  // A partir daqui o formulário inteiro usa esses quatro "active*" em vez
  // dos props crus, então funciona igual nos dois modos: cliente fixo (vem
  // pronto) ou escolhido no picker (muda em runtime).
  const activeClientId = isFixedClient ? clientId! : pickedClientId;
  const activeClientName = isFixedClient ? clientName ?? "" : pickedClient?.name ?? "";
  const activeClientWhatsapp = isFixedClient ? clientWhatsapp : pickedClient?.whatsapp ?? null;
  const activeClientFeeStatus = isFixedClient
    ? clientReservationFeeStatus ?? "nao_aplica"
    : pickedClient?.reservation_fee_status ?? "nao_aplica";

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
  // "valor" = discountValue já é reais. "percentual" = discountValue é uma
  // porcentagem (0-100) sobre o valor dos disparos (pricing.totalValue),
  // convertida pra reais em discountNumber logo abaixo.
  const [discountType, setDiscountType] = useState<"valor" | "percentual">("valor");
  const [reservationFeeStatus, setReservationFeeStatus] = useState<ReservationFeeStatus>("nao_aplica");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [previewCopied, setPreviewCopied] = useState(false);
  const [pendingReservations, setPendingReservations] = useState<PendingReservation[]>([]);

  // Se o cliente já tem uma pré-reserva pendente (feita em "Reservar
  // HIPRO"), lançar os disparos aqui pelo mesmo equipamento/data vai
  // esbarrar na trava de conflito de agenda, porque criaria uma SEGUNDA
  // entrada em cima da mesma reserva, em vez de completar a que já existe.
  // Mostra isso antes, com o link direto pra Agenda, pra finalizar a
  // reserva certa em vez de bater nesse erro sem entender por quê.
  useEffect(() => {
    let active = true;
    if (!activeClientId) {
      setPendingReservations([]);
      return;
    }
    supabase
      .from("calendar_events")
      .select("id, equipment_id, date_start, equipments(name)")
      .eq("client_id", activeClientId)
      .eq("status", "pre_reserva")
      .is("rental_id", null)
      .then(({ data }) => {
        if (!active) return;
        setPendingReservations(
          (data ?? []).map((r: any) => ({
            id: r.id,
            equipment_id: r.equipment_id,
            date_start: r.date_start,
            equipmentName: (Array.isArray(r.equipments) ? r.equipments[0] : r.equipments)?.name ?? "equipamento",
          }))
        );
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId]);

  // Pedido 3 da auditoria: se o cliente já está com a taxa de reserva paga
  // ou pendente, pré-seleciona a opção certa e abre a seção de extras
  // sozinha (M5), em vez de depender de lembrar de marcar isso manualmente.
  // Roda de novo sempre que o cliente ativo muda (troca no picker).
  useEffect(() => {
    if (!activeClientId) return;
    if (activeClientFeeStatus === "pago") {
      setReservationFeeStatus("ja_paga");
      setShowExtras(true);
    } else if (activeClientFeeStatus === "pendente") {
      setReservationFeeStatus("cobrar_agora");
      setShowExtras(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId]);

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
      eventDate,
      clientName: activeClientName,
      paymentMethod,
      reservationFee: fee,
    });
  }, [pricing, initialNumber, finalNumber, additionalNumber, additionalDescription, discountNumber, effectiveDiscountDescription, reservationFeeStatus, eventDate, activeClientName, paymentMethod, fee]);

  const previewSummary = useMemo(() => {
    if (!pricing) return null;
    return buildWhatsAppSummary({
      initialCount: initialNumber,
      finalCount: finalNumber,
      pricing,
      additionalChargeValue: additionalNumber,
      additionalChargeDescription: additionalDescription,
      discountValue: discountNumber,
      discountDescription: effectiveDiscountDescription,
      reservationFeeStatus,
      eventDate,
      clientName: activeClientName,
      paymentMethod,
      reservationFee: fee,
    });
  }, [pricing, initialNumber, finalNumber, additionalNumber, additionalDescription, discountNumber, effectiveDiscountDescription, reservationFeeStatus, eventDate, activeClientName, paymentMethod, fee]);

  const previewWhatsappLink = previewSummary ? buildWhatsAppLink(activeClientWhatsapp, previewSummary) : null;

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
    if (!activeClientId) {
      setError("Selecione o cliente.");
      return;
    }
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
      p_client_id: activeClientId,
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
        const matchingPending = pendingReservations.find((r) => r.equipment_id === equipmentId && r.date_start === eventDate);
        if (matchingPending) {
          setError(
            `⚠️ ${activeClientName} já tem uma pré-reserva pendente no ${equipmentName} nesse dia. Não dá pra criar uma locação nova em cima dela. Abra essa reserva na Agenda e use "Finalizar com disparos" nela em vez disso.`
          );
        } else {
          setError(`⚠️ O ${equipmentName} já está reservado neste período.`);
        }
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
          description: `Taxa de reserva - ${activeClientName}`,
          amount: fee,
          payment_method: paymentMethod,
          date: eventDate,
          scope: "harmonize",
          client_id: activeClientId,
          rental_id: rentalId,
        });
        if (feeError) {
          setWarning("A locação foi salva, mas a taxa de reserva não foi registrada automaticamente. Adicione manualmente em Financeiro.");
        }
      } else {
        setWarning("A locação foi salva, mas não encontrei a categoria 'Taxa de reserva' para registrar automaticamente.");
      }
      // B2 da auditoria: cobrar a taxa aqui nunca marcava o cliente como
      // pago, então ele ficava "taxa pendente" pra sempre mesmo já tendo
      // pago, e o Relatórios continuava somando ele na taxa a receber.
      await supabase.from("clients").update({ reservation_fee_status: "pago" }).eq("id", activeClientId);
    } else if (reservationFeeStatus === "ja_paga") {
      // B3 da auditoria: creditar a taxa aqui não consumia o crédito, então
      // o mesmo valor podia ser descontado de novo na próxima locação do
      // mesmo cliente, sem nenhum aviso.
      await supabase.from("clients").update({ reservation_fee_status: "nao_aplica" }).eq("id", activeClientId);
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
        eventDate,
        clientName: activeClientName,
        paymentMethod,
        // Faltava aqui (bug da auditoria): sem isso, o resumo final usava
        // sempre o fallback fixo de R$ 250 em vez da taxa configurada.
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

  const whatsappLink = summary ? buildWhatsAppLink(activeClientWhatsapp, summary) : null;

  // Tela de sucesso: locação já salva, mostra o resumo para copiar/enviar
  if (summary) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl">
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Locação salva ✅</h2>
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Nova locação</h2>

        {!isFixedClient && (
          <div className="mb-3">
            <ClientPicker
              clients={localClientList}
              value={pickedClientId}
              onChange={setPickedClientId}
              onClientCreated={(c) => setLocalClientList((prev) => [...prev, c])}
            />
          </div>
        )}

        {activeClientFeeStatus === "pago" && (
          <div className="mb-4 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3 text-xs text-brand-teal">
            💳 {activeClientName || "Este cliente"} já pagou a taxa de reserva ({formatCurrency(fee)}). A opção "Já foi
            paga" abaixo já está marcada para descontar do total.
          </div>
        )}
        {activeClientFeeStatus === "pendente" && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
            💳 {activeClientName || "Este cliente"} está com a taxa de reserva pendente. A opção "Cobrar agora" abaixo
            já está marcada.
          </div>
        )}

        {pendingReservations.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
            <p className="font-medium">
              {activeClientName} já tem {pendingReservations.length > 1 ? "pré-reservas pendentes" : "uma pré-reserva pendente"}:
            </p>
            <ul className="mt-1 space-y-0.5">
              {pendingReservations.map((r) => (
                <li key={r.id}>
                  {r.equipmentName} · {formatDate(r.date_start)} ·{" "}
                  <Link href={`/agenda?date=${r.date_start}`} className="underline underline-offset-2">
                    abrir na Agenda
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-1">
              Pra lançar os disparos de uma dessas, use "Finalizar com disparos" nela, em vez de criar uma locação nova aqui.
            </p>
          </div>
        )}

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

              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Taxa de reserva (R$ 250)</label>
                <select
                  value={reservationFeeStatus}
                  onChange={(e) => setReservationFeeStatus(e.target.value as ReservationFeeStatus)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
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
                <button
                  type="button"
                  onClick={() => openInNewTab(previewWhatsappLink)}
                  className="flex-1 rounded-xl border border-brand-teal py-2 text-center text-xs font-medium text-brand-teal"
                >
                  Enviar orçamento no WhatsApp
                </button>
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

        <p className="mt-3 text-xs text-neutral-400">
          Ao salvar, a locação, a entrada financeira e o evento na agenda são criados automaticamente.
        </p>

        <div className="mt-4 flex gap-2">
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
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
