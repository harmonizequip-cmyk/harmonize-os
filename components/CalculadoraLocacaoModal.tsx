"use client";

// ============================================================
// HARMONIZE OS — Calculadora unificada de locação (leva 2)
// ============================================================
// Substitui NovaLocacaoModal (app/(app)/clientes/[id]) e
// FinalizarReservaModal (app/(app)/agenda): mesmo layout/fluxo do
// protótipo aprovado (contagem -> resumo com faixa -> ajustes finais ->
// pagamento -> WhatsApp), agora com a fórmula real de precificação
// (lib/rental-pricing, não a tabela fixa do protótipo) e os recursos da
// leva O: pagamento múltiplo/parcial, deslocamento, custo por disparo
// negociado, e despesa da locação lançada na hora.
//
// `mode` decide o que a tela pede:
//   - "create": cliente ainda por definir (picker) ou fixo (ficha do
//     cliente), equipamento e data escolhidos na tela — igual
//     NovaLocacaoModal.
//   - "finalize": pré-reserva já tem cliente/equipamento/data (vindos de
//     "Reservar HIPRO"); só falta a contagem (ou pacientes modelo, se
//     isMentoria) — igual FinalizarReservaModal.
//
// PAGAMENTO: sempre chama create_rental/finalize_rental_reservation com
// p_pago=false, depois registra cada linha da lista `pagamentos` via
// registrar_pagamento_locacao. Zero linhas = fica em aberto ("a
// receber"), uma linha = pago integral, duas ou mais = parcial — os três
// estados são o mesmo código, só muda quantas linhas a pessoa preencheu.
// A taxa de reserva cobrada agora continua em transactions por fora de
// rental_payments, do jeito que já era (definir_taxa_agendamento).
// ============================================================

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ClientPicker from "@/components/ClientPicker";
import {
  calculateRentalValue,
  calculateMentoriaValue,
  DEFAULT_MENTORIA_PRICING,
  RentalPricingError,
  MentoriaPricingError,
  type PricingConfig,
  type MentoriaPricingConfig,
} from "@/lib/rental-pricing";
import {
  calcularResumoLocacao,
  calcularValorDeslocamento,
  buildResumoWhatsApp,
  PAYMENT_METHODS,
  PAYMENT_LABELS,
  PIX_CONTAS,
  RESERVATION_FEE,
  type ItemAjuste,
  type PagamentoLinha,
  type PixContaValue,
  type ReservationFeeStatus,
} from "@/lib/rental-calculator";
import { formatCurrency, formatDate, buildWhatsAppLink } from "@/lib/format";
import { hojeLocal } from "@/lib/period";

let idSeq = 0;
function newId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now()}-${idSeq}`;
}

function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}
function parseDecimal(v: string): number {
  return Number(v.replace(/\./g, "").replace(",", ".")) || 0;
}

export interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

// Superset do ClientOption do ClientPicker (id/name) — parceiro decide se
// a taxa de reserva se aplica, mesma regra do gatilho do banco.
export interface ClientWithExtras {
  id: string;
  name: string;
  whatsapp?: string | null;
  parceiro?: boolean | null;
}

interface PendingReservation {
  id: string;
  equipment_id: string | null;
  date_start: string;
  equipmentName: string;
}

interface CategoryOption {
  id: string;
  name: string;
}

type CalculadoraLocacaoMode =
  | {
      kind: "create";
      clientId?: string;
      clientName?: string;
      clientWhatsapp?: string | null;
      clientParceiro?: boolean | null;
      clients?: ClientWithExtras[];
      equipments: EquipmentOption[];
    }
  | {
      kind: "finalize";
      reservation: {
        id: string; // calendar_events.id
        clientId: string;
        clientName: string;
        clientWhatsapp?: string | null;
        taxaStatus?: string | null;
        equipmentName: string;
        eventDate: string;
      };
      isMentoria?: boolean;
    };

export default function CalculadoraLocacaoModal({
  mode,
  pricingConfig,
  reservationFee,
  mentoriaPricing,
  onClose,
  onDone,
}: {
  mode: CalculadoraLocacaoMode;
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  mentoriaPricing?: MentoriaPricingConfig;
  onClose: () => void;
  onDone: () => void;
}) {
  const supabase = createClient();
  const fee = reservationFee ?? RESERVATION_FEE;
  const mentoriaPricingResolved = mentoriaPricing ?? DEFAULT_MENTORIA_PRICING;
  const isMentoria = mode.kind === "finalize" && !!mode.isMentoria;

  // ------------------------------------------------------------
  // Cliente
  // ------------------------------------------------------------
  const isFixedClient = mode.kind === "finalize" || !!mode.clientId;
  const [localClientList, setLocalClientList] = useState<ClientWithExtras[]>(
    mode.kind === "create" ? mode.clients ?? [] : []
  );
  const [pickedClientId, setPickedClientId] = useState("");
  const pickedClient = localClientList.find((c) => c.id === pickedClientId);

  const activeClientId =
    mode.kind === "finalize" ? mode.reservation.clientId : mode.clientId ?? pickedClientId;
  const activeClientName =
    mode.kind === "finalize" ? mode.reservation.clientName : mode.clientId ? mode.clientName ?? "" : pickedClient?.name ?? "";
  const activeClientWhatsapp =
    mode.kind === "finalize" ? mode.reservation.clientWhatsapp : mode.clientId ? mode.clientWhatsapp : pickedClient?.whatsapp ?? null;
  const activeClientParceiro = mode.kind === "finalize" ? false : mode.clientId ? !!mode.clientParceiro : !!pickedClient?.parceiro;

  // ------------------------------------------------------------
  // Equipamento e data
  // ------------------------------------------------------------
  const equipmentsList = mode.kind === "create" ? mode.equipments : [];
  const [equipmentId, setEquipmentId] = useState(equipmentsList[0]?.id ?? "");
  const [eventDate, setEventDate] = useState(() =>
    mode.kind === "finalize" ? mode.reservation.eventDate : new Date().toISOString().slice(0, 10)
  );
  const equipmentLabel = mode.kind === "finalize" ? mode.reservation.equipmentName : equipmentsList.find((e) => e.id === equipmentId)?.name ?? "";

  const [pendingReservations, setPendingReservations] = useState<PendingReservation[]>([]);
  useEffect(() => {
    let active = true;
    if (mode.kind !== "create" || !activeClientId) {
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
  }, [activeClientId, mode.kind]);

  // Vincular a uma pré-reserva pendente em vez de criar uma locação do
  // zero: evita a duplicidade na raiz (uma reserva vira um registro só,
  // nunca dois brigando entre si) em vez de só avisar e deixar por conta
  // de quem está usando lembrar de ir na Agenda. Ao vincular, data e
  // equipamento passam a ser os da própria pré-reserva (ela já é a fonte
  // da verdade) — por isso ficam travados enquanto o vínculo existir.
  const [linkedReservationId, setLinkedReservationId] = useState<string | null>(null);
  const linkedReservation = pendingReservations.find((r) => r.id === linkedReservationId) ?? null;

  function handleLinkReservation(r: PendingReservation) {
    setLinkedReservationId(r.id);
    if (r.equipment_id) setEquipmentId(r.equipment_id);
    setEventDate(r.date_start);
  }
  function handleUnlinkReservation() {
    setLinkedReservationId(null);
  }
  // Se o cliente mudar (ou a pré-reserva escolhida sumir da lista por
  // qualquer motivo), o vínculo não faz mais sentido sozinho.
  useEffect(() => {
    if (linkedReservationId && !pendingReservations.some((r) => r.id === linkedReservationId)) {
      setLinkedReservationId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingReservations]);

  // ------------------------------------------------------------
  // Contagem do equipamento (ou pacientes modelo, em mentoria)
  // ------------------------------------------------------------
  const [initialCount, setInitialCount] = useState("");
  const [finalCount, setFinalCount] = useState("");
  const [patientCount, setPatientCount] = useState("1");
  const [notes, setNotes] = useState("");

  const initialNumber = Number(onlyDigits(initialCount));
  const finalNumber = Number(onlyDigits(finalCount));
  const shots = finalCount && initialCount ? finalNumber - initialNumber : 0;
  const patientCountNumber = Number(onlyDigits(patientCount)) || 0;

  const pricing = useMemo(() => {
    if (isMentoria || !shots || shots <= 0) return null;
    try {
      return calculateRentalValue(shots, pricingConfig);
    } catch (e) {
      if (e instanceof RentalPricingError) return null;
      throw e;
    }
  }, [isMentoria, shots, pricingConfig]);

  const mentoriaCalc = useMemo(() => {
    if (!isMentoria || patientCountNumber <= 0) return null;
    try {
      // A forma de pagamento que decide à vista/parcelado é a da PRIMEIRA
      // linha de pagamento preenchida (crédito = parcelado); sem nenhuma
      // ainda, assume à vista, que é o caso mais comum.
      return calculateMentoriaValue(patientCountNumber, primeiraFormaPagamento || "pix", mentoriaPricingResolved);
    } catch (e) {
      if (e instanceof MentoriaPricingError) return null;
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMentoria, patientCountNumber, mentoriaPricingResolved]);

  // ------------------------------------------------------------
  // Custo por disparo negociado manualmente (não existe em mentoria)
  // ------------------------------------------------------------
  const [usarCustoManual, setUsarCustoManual] = useState(false);
  const [custoManualInput, setCustoManualInput] = useState(""); // centavos, estilo protótipo: "9" = R$0,09
  const custoManualPorDisparo = usarCustoManual && custoManualInput ? Number(onlyDigits(custoManualInput)) / 100 : null;

  // ------------------------------------------------------------
  // Deslocamento
  // ------------------------------------------------------------
  const [kmIda, setKmIda] = useState("");
  const kmIdaNumber = Number(onlyDigits(kmIda)) || 0;
  const valorDeslocamentoPreview = calcularValorDeslocamento(kmIdaNumber);

  // ------------------------------------------------------------
  // Ajustes finais: aluguel (+) e desconto (-) fixos do protótipo, mais
  // itens personalizados livres — todos viram ItemAjuste[] para o cálculo.
  // ------------------------------------------------------------
  const [aluguelValor, setAluguelValor] = useState("");
  const [descontoValor, setDescontoValor] = useState("");
  const [descontoTipo, setDescontoTipo] = useState<"valor" | "percentual">("valor");
  const [itensPersonalizados, setItensPersonalizados] = useState<ItemAjuste[]>([]);
  const [novoItemDesc, setNovoItemDesc] = useState("");
  const [novoItemValor, setNovoItemValor] = useState("");
  const [novoItemTipo, setNovoItemTipo] = useState<"mais" | "menos">("mais");

  const subtotalParaDesconto = (isMentoria ? mentoriaCalc?.totalValue : pricing?.totalValue) ?? 0;
  const aluguelNumero = parseDecimal(aluguelValor);
  const descontoRawNumero = parseDecimal(descontoValor);
  const descontoNumero =
    descontoTipo === "percentual" ? Math.round(subtotalParaDesconto * (descontoRawNumero / 100) * 100) / 100 : descontoRawNumero;
  const descontoDescricaoEfetiva = descontoTipo === "percentual" ? `${descontoRawNumero}% de desconto` : "Desconto";

  const itens: ItemAjuste[] = useMemo(() => {
    const lista: ItemAjuste[] = [];
    if (aluguelNumero > 0) lista.push({ id: "aluguel", desc: "Aluguel", valor: aluguelNumero, tipo: "mais" });
    if (descontoNumero > 0) lista.push({ id: "desconto", desc: descontoDescricaoEfetiva, valor: descontoNumero, tipo: "menos" });
    return [...lista, ...itensPersonalizados];
  }, [aluguelNumero, descontoNumero, descontoDescricaoEfetiva, itensPersonalizados]);

  function addItemPersonalizado() {
    const valor = parseDecimal(novoItemValor);
    if (!novoItemDesc.trim() || valor <= 0) return;
    setItensPersonalizados((prev) => [...prev, { id: newId("item"), desc: novoItemDesc.trim(), valor, tipo: novoItemTipo }]);
    setNovoItemDesc("");
    setNovoItemValor("");
  }
  function removeItemPersonalizado(id: string) {
    setItensPersonalizados((prev) => prev.filter((i) => i.id !== id));
  }

  // ------------------------------------------------------------
  // Taxa de reserva
  // ------------------------------------------------------------
  const feeIsPaid = mode.kind === "finalize" && mode.reservation.taxaStatus === "paga";
  const feePending = mode.kind === "finalize" && mode.reservation.taxaStatus === "pendente";
  // Em modo "create", a taxa nasce pendente sozinha (gatilho do banco)
  // quando a data é futura e o cliente não é parceiro — mesma conta de
  // definir_taxa_ao_criar_evento. Só decide se a opção aparece na tela.
  const feeWouldApplyOnCreate = mode.kind === "create" && !activeClientParceiro && eventDate > hojeLocal();
  const [chargeFeeNow, setChargeFeeNow] = useState(false);
  const reservationFeeStatus: ReservationFeeStatus = feeIsPaid
    ? "ja_paga"
    : (feePending || feeWouldApplyOnCreate) && chargeFeeNow
    ? "cobrar_agora"
    : "nao_aplica";

  // ------------------------------------------------------------
  // Pagamento: lista de linhas (forma/valor/conta pix). 0 = a receber,
  // 1 = integral, 2+ = parcial.
  // ------------------------------------------------------------
  const [pagamentos, setPagamentos] = useState<PagamentoLinha[]>([
    { id: newId("pag"), forma: "pix", valor: 0, pixConta: "harmonize", data: hojeLocal() },
  ]);
  const primeiraFormaPagamento = pagamentos[0]?.forma ?? "";

  function updatePagamento(id: string, patch: Partial<PagamentoLinha>) {
    setPagamentos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPagamento() {
    setPagamentos((prev) => [...prev, { id: newId("pag"), forma: "pix", valor: 0, pixConta: "harmonize", data: hojeLocal() }]);
  }
  function removePagamento(id: string) {
    setPagamentos((prev) => prev.filter((p) => p.id !== id));
  }

  // ------------------------------------------------------------
  // Resumo/totais
  // ------------------------------------------------------------
  const resumo = useMemo(() => {
    if (isMentoria && !mentoriaCalc) return null;
    if (!isMentoria && !pricing) return null;
    return calcularResumoLocacao({
      isMentoria,
      shots,
      pricing,
      custoManualPorDisparo,
      mentoriaPricing: mentoriaCalc,
      kmIda: kmIdaNumber,
      itens,
      reservationFeeStatus,
      reservationFee: fee,
    });
  }, [isMentoria, mentoriaCalc, pricing, shots, custoManualPorDisparo, kmIdaNumber, itens, reservationFeeStatus, fee]);

  function preencherValorTotal(id: string) {
    if (!resumo) return;
    updatePagamento(id, { valor: resumo.totalAPagarAgora });
  }

  const somaPagamentos = useMemo(() => Math.round(pagamentos.reduce((acc, p) => acc + (p.valor || 0), 0) * 100) / 100, [pagamentos]);
  const saldoAposPagamentos = resumo ? Math.round((resumo.totalAPagarAgora - somaPagamentos) * 100) / 100 : 0;

  // ------------------------------------------------------------
  // Salvar
  // ------------------------------------------------------------
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedRentalId, setSavedRentalId] = useState<string | null>(null);

  // ------------------------------------------------------------
  // Preview no WhatsApp (leva P.1): manda o resumo pro cliente conferir
  // ANTES de salvar/registrar pagamento. O pedido é conseguir enviar os
  // cálculos, o cliente confirmar, e só depois lançar o(s) pagamento(s)
  // (que podem vir em formas diferentes) — sem precisar já ter salvo a
  // locação. Usa o mesmo buildResumoWhatsApp de sempre, só que com os
  // valores ainda não persistidos; não grava nada no banco.
  const previewWhatsappText = useMemo(() => {
    if (!resumo) return null;
    return buildResumoWhatsApp(
      {
        isMentoria,
        shots,
        pricing,
        custoManualPorDisparo,
        mentoriaPricing: mentoriaCalc,
        kmIda: kmIdaNumber,
        itens,
        reservationFeeStatus,
        reservationFee: fee,
        initialCount: initialNumber,
        finalCount: finalNumber,
        patientCount: patientCountNumber,
        clientName: activeClientName,
        eventDate,
        pagamentos,
      },
      resumo
    );
  }, [
    resumo,
    isMentoria,
    shots,
    pricing,
    custoManualPorDisparo,
    mentoriaCalc,
    kmIdaNumber,
    itens,
    reservationFeeStatus,
    fee,
    initialNumber,
    finalNumber,
    patientCountNumber,
    activeClientName,
    eventDate,
    pagamentos,
  ]);
  const previewWhatsappLink = previewWhatsappText ? buildWhatsAppLink(activeClientWhatsapp, previewWhatsappText) : null;
  const [previewCopied, setPreviewCopied] = useState(false);
  async function handleCopyPreview() {
    if (!previewWhatsappText) return;
    try {
      await navigator.clipboard.writeText(previewWhatsappText);
      setPreviewCopied(true);
      setTimeout(() => setPreviewCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  async function handleSave() {
    if (mode.kind === "create" && !activeClientId) {
      setError("Selecione o cliente.");
      return;
    }
    if (mode.kind === "create" && (!equipmentId || !eventDate)) {
      setError("Preencha o equipamento e a data.");
      return;
    }
    if (isMentoria) {
      if (!patientCount || patientCountNumber <= 0) {
        setError("Informe a quantidade de pacientes modelo.");
        return;
      }
    } else {
      if (!initialCount || !finalCount) {
        setError("Preencha a contagem inicial e final do equipamento.");
        return;
      }
      if (finalNumber <= initialNumber) {
        setError("A contagem final precisa ser maior que a inicial.");
        return;
      }
    }
    if (!resumo) {
      setError(isMentoria ? "Não foi possível calcular o valor. Confira a quantidade de pacientes modelo." : "Não foi possível calcular o valor. Confira as contagens.");
      return;
    }
    for (const p of pagamentos) {
      if (p.valor > 0 && p.forma === "pix" && !p.pixConta) {
        setError("Informe em qual conta o PIX de cada pagamento caiu.");
        return;
      }
    }

    setSaving(true);
    setError(null);
    setWarning(null);

    const primeiraForma = (pagamentos.find((p) => p.valor > 0)?.forma as any) ?? "pix";
    const primeiraPixConta = pagamentos.find((p) => p.valor > 0 && p.forma === "pix")?.pixConta || null;

    let rentalId: string | null = null;
    let eventIdParaTaxa: string | null =
      mode.kind === "finalize" ? mode.reservation.id : linkedReservationId;

    if (mode.kind === "create" && linkedReservationId) {
      // Vinculado a uma pré-reserva já existente: finaliza ELA em vez de
      // criar uma locação do zero, exatamente como o fluxo "Finalizar"
      // da Agenda faz — uma reserva continua sendo um registro só.
      const { data, error: rpcError } = await supabase.rpc("finalize_rental_reservation", {
        p_calendar_event_id: linkedReservationId,
        p_shots: shots,
        p_calculated_value: resumo.valorLocacao,
        p_payment_method: primeiraForma,
        p_notes: notes || null,
        p_pix_conta: primeiraPixConta,
        p_pago: false,
      });
      if (rpcError) {
        setSaving(false);
        setError("Não foi possível finalizar a reserva vinculada. Tente novamente.");
        return;
      }
      rentalId = data as string;
    } else if (mode.kind === "create") {
      const { data, error: rpcError } = await supabase.rpc("create_rental", {
        p_client_id: activeClientId,
        p_equipment_id: equipmentId,
        p_event_date: eventDate,
        p_shots: shots,
        p_calculated_value: resumo.valorLocacao,
        p_payment_method: primeiraForma,
        p_notes: notes || null,
        p_pago: false,
        p_pix_conta: primeiraPixConta,
      });
      if (rpcError) {
        setSaving(false);
        if (rpcError.code === "23P01") {
          const equipmentName = equipmentsList.find((e) => e.id === equipmentId)?.name ?? "equipamento";
          const matchingPending = pendingReservations.find((r) => r.equipment_id === equipmentId && r.date_start === eventDate);
          setError(
            matchingPending
              ? `⚠️ ${activeClientName} já tem uma pré-reserva pendente no ${equipmentName} nesse dia. Use o botão "usar em vez de criar nova" acima, ou abra essa reserva na Agenda e use "Finalizar" nela.`
              : `⚠️ O ${equipmentName} já está reservado neste período.`
          );
        } else {
          setError("Não foi possível salvar a locação. Tente novamente.");
        }
        return;
      }
      rentalId = data as string;
    } else {
      const { data, error: rpcError } = await supabase.rpc("finalize_rental_reservation", {
        p_calendar_event_id: mode.reservation.id,
        p_shots: isMentoria ? patientCountNumber : shots,
        p_calculated_value: resumo.valorLocacao,
        p_payment_method: primeiraForma,
        p_notes: notes || null,
        p_pix_conta: primeiraPixConta,
        p_pago: false,
      });
      if (rpcError) {
        setSaving(false);
        setError("Não foi possível finalizar a reserva. Tente novamente.");
        return;
      }
      rentalId = data as string;
    }

    if (!rentalId) {
      setSaving(false);
      setError("A locação foi criada, mas não recebi o id de volta. Confira na ficha do cliente.");
      return;
    }
    setSavedRentalId(rentalId);

    const avisos: string[] = [];

    if (!isMentoria && custoManualPorDisparo != null) {
      const { error: e1 } = await supabase.rpc("definir_custo_disparo_manual_locacao", {
        p_rental_id: rentalId,
        p_custo_disparo_manual: custoManualPorDisparo,
      });
      if (e1) avisos.push("o custo por disparo negociado não foi salvo automaticamente");
    }

    if (kmIdaNumber > 0) {
      const { error: e2 } = await supabase.rpc("definir_deslocamento_locacao", {
        p_rental_id: rentalId,
        p_km_ida: kmIdaNumber,
        p_valor_deslocamento: resumo.valorDeslocamento,
      });
      if (e2) avisos.push("o deslocamento não foi salvo automaticamente");
    }

    if (reservationFeeStatus === "cobrar_agora") {
      if (!eventIdParaTaxa) {
        const { data: eventRow } = await supabase.from("calendar_events").select("id").eq("rental_id", rentalId).limit(1).maybeSingle();
        eventIdParaTaxa = eventRow?.id ?? null;
      }
      if (eventIdParaTaxa) {
        const { error: e3 } = await supabase.rpc("definir_taxa_agendamento", {
          p_event_id: eventIdParaTaxa,
          p_status: "paga",
          p_payment_method: primeiraForma,
        });
        if (e3) avisos.push("a taxa de reserva não foi registrada automaticamente (marque como paga na ficha do cliente)");
      } else {
        avisos.push("não encontrei o agendamento para registrar a taxa automaticamente");
      }
    }

    for (const p of pagamentos) {
      if (p.valor <= 0) continue;
      const { error: ePag } = await supabase.rpc("registrar_pagamento_locacao", {
        p_rental_id: rentalId,
        p_forma: p.forma,
        p_valor: p.valor,
        // Data em que o pagamento entrou de fato, não a data do HIPRO —
        // são registros diferentes por design (rentals.event_date de um
        // lado, esta data por outro).
        p_data: p.data || eventDate,
        p_pix_conta: p.forma === "pix" ? p.pixConta || null : null,
        p_notes: null,
      });
      if (ePag) avisos.push(`um pagamento (${PAYMENT_LABELS[p.forma] ?? p.forma} · ${formatCurrency(p.valor)}) não foi registrado`);
    }

    setSaving(false);
    if (avisos.length > 0) {
      setWarning(`A locação foi salva, mas ${avisos.join("; ")}. Confira na ficha do cliente.`);
    }

    setSummary(
      buildResumoWhatsApp(
        {
          isMentoria,
          shots,
          pricing,
          custoManualPorDisparo,
          mentoriaPricing: mentoriaCalc,
          kmIda: kmIdaNumber,
          itens,
          reservationFeeStatus,
          reservationFee: fee,
          initialCount: initialNumber,
          finalCount: finalNumber,
          patientCount: patientCountNumber,
          clientName: activeClientName,
          eventDate,
          pagamentos,
        },
        resumo
      )
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

  // ------------------------------------------------------------
  // Despesa da locação (leva O): ligada a ESTA locação, lançada na tela
  // de sucesso. Busca categorias de saída só quando chega ali.
  // ------------------------------------------------------------
  const [categoriasSaida, setCategoriasSaida] = useState<CategoryOption[] | null>(null);
  const [despCategoriaId, setDespCategoriaId] = useState("");
  const [despValor, setDespValor] = useState("");
  const [despForma, setDespForma] = useState("dinheiro");
  const [despDescricao, setDespDescricao] = useState("");
  const [despSalvando, setDespSalvando] = useState(false);
  const [despErro, setDespErro] = useState<string | null>(null);
  const [despesasLancadas, setDespesasLancadas] = useState<{ desc: string; valor: number }[]>([]);

  useEffect(() => {
    if (!summary || categoriasSaida !== null) return;
    supabase
      .from("categories")
      .select("id, name")
      .eq("type", "saida")
      .eq("scope", "harmonize")
      .order("name")
      .then(({ data }) => setCategoriasSaida(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  async function handleAddDespesa() {
    const valor = parseDecimal(despValor);
    if (!despCategoriaId || valor <= 0 || !savedRentalId) {
      setDespErro("Escolha a categoria e um valor maior que zero.");
      return;
    }
    setDespSalvando(true);
    setDespErro(null);
    const { error: eDesp } = await supabase.rpc("registrar_despesa_locacao", {
      p_rental_id: savedRentalId,
      p_category_id: despCategoriaId,
      p_amount: valor,
      p_payment_method: despForma,
      p_date: eventDate,
      p_description: despDescricao || null,
      p_notes: null,
    });
    setDespSalvando(false);
    if (eDesp) {
      setDespErro("Não foi possível lançar essa despesa. Tente novamente.");
      return;
    }
    setDespesasLancadas((prev) => [...prev, { desc: despDescricao || categoriasSaida?.find((c) => c.id === despCategoriaId)?.name || "Despesa", valor }]);
    setDespValor("");
    setDespDescricao("");
  }

  // ============================================================
  // TELA DE SUCESSO
  // ============================================================
  if (summary) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center">
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl">
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {mode.kind === "create" ? "Locação salva ✅" : isMentoria ? "Mentoria finalizada ✅" : "Locação finalizada ✅"}
          </h2>
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
            <button onClick={handleCopy} className="rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600">
              {copied ? "Copiado!" : "Copiar texto"}
            </button>
          </div>

          {/* Despesa da locação (leva O): ligada a ESTA locação */}
          <div className="mt-5 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
            <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              + Lançar despesa desta locação <span className="font-normal text-neutral-400">(combustível, hospedagem, insumos...)</span>
            </p>
            {despesasLancadas.length > 0 && (
              <ul className="mb-2 space-y-0.5 text-xs text-neutral-500">
                {despesasLancadas.map((d, i) => (
                  <li key={i}>
                    ✅ {d.desc}: {formatCurrency(d.valor)}
                  </li>
                ))}
              </ul>
            )}
            {categoriasSaida === null ? (
              <p className="text-xs text-neutral-400">Carregando categorias...</p>
            ) : (
              <div className="space-y-2">
                <select
                  value={despCategoriaId}
                  onChange={(e) => setDespCategoriaId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="">Categoria da despesa...</option>
                  {categoriasSaida.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    value={despValor}
                    onChange={(e) => setDespValor(e.target.value)}
                    placeholder="R$ 0,00"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <select
                    value={despForma}
                    onChange={(e) => setDespForma(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {PAYMENT_METHODS.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  value={despDescricao}
                  onChange={(e) => setDespDescricao(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                {despErro && <p className="text-xs text-red-600 dark:text-red-400">{despErro}</p>}
                <button
                  type="button"
                  onClick={handleAddDespesa}
                  disabled={despSalvando}
                  className="w-full rounded-lg border border-brand-teal py-2 text-xs font-medium text-brand-teal disabled:opacity-60"
                >
                  {despSalvando ? "Lançando..." : "+ Lançar despesa"}
                </button>
              </div>
            )}
          </div>

          <button onClick={onDone} className="mt-4 w-full rounded-xl bg-neutral-900 py-2.5 text-sm font-medium text-white">
            Concluir
          </button>
        </div>
      </div>
    );
  }

  // ============================================================
  // TELA DE FORMULÁRIO
  // ============================================================
  const disparosValidos = !isMentoria && shots > 0 && !!pricing;
  const podeSalvar = isMentoria ? !!mentoriaCalc : disparosValidos;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          {mode.kind === "create" ? "Nova locação" : isMentoria ? "Finalizar mentoria" : "Finalizar reserva"}
        </h2>
        {mode.kind === "finalize" && (
          <p className="mb-4 text-xs text-neutral-400">
            {equipmentLabel} · {formatDate(eventDate)} · {activeClientName}
          </p>
        )}

        {mode.kind === "create" && !isFixedClient && (
          <div className="mb-3">
            <ClientPicker
              clients={localClientList}
              value={pickedClientId}
              onChange={setPickedClientId}
              onClientCreated={(c) => setLocalClientList((prev) => [...prev, c])}
            />
          </div>
        )}

        {pendingReservations.length > 0 && !linkedReservationId && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-400">
            <p className="font-medium">
              ⚠️ {activeClientName} já tem {pendingReservations.length > 1 ? "pré-reservas pendentes" : "uma pré-reserva pendente"}. Antes de continuar, confira se não é a mesma reserva:
            </p>
            <ul className="mt-2 space-y-2">
              {pendingReservations.map((r) => (
                <li key={r.id} className="rounded-lg border border-amber-200 bg-white/60 p-2 dark:border-amber-900/40 dark:bg-neutral-900/30">
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {r.equipmentName} · {formatDate(r.date_start)}
                    </span>
                    <Link href={`/agenda?date=${r.date_start}`} className="whitespace-nowrap underline underline-offset-2">
                      abrir na Agenda
                    </Link>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleLinkReservation(r)}
                    className="mt-1.5 w-full rounded-lg bg-amber-600 py-1.5 text-center text-xs font-medium text-white"
                  >
                    É esta mesma reserva → usar em vez de criar nova
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2">Se for mesmo uma locação diferente (outro dia, outro motivo), pode ignorar e seguir normalmente.</p>
          </div>
        )}

        {linkedReservationId && linkedReservation && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-brand-teal/40 bg-brand-teal/10 p-3 text-xs text-brand-teal">
            <span>
              🔗 Vinculado à pré-reserva de {linkedReservation.equipmentName} em {formatDate(linkedReservation.date_start)} — não vai criar registro duplicado.
            </span>
            <button type="button" onClick={handleUnlinkReservation} className="whitespace-nowrap underline underline-offset-2">
              desvincular
            </button>
          </div>
        )}

        {feeIsPaid && (
          <div className="mb-4 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3 text-xs text-brand-teal">
            💳 A taxa de reserva desta data ({formatCurrency(fee)}) já foi paga. Ela entra como crédito no total abaixo.
          </div>
        )}
        {feePending && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-400">
            💳 A taxa de reserva desta data está pendente. Marque "Cobrar taxa de reserva agora" mais abaixo se for cobrar junto.
          </div>
        )}

        <div className="space-y-4">
          {mode.kind === "create" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Equipamento</label>
                <select
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  disabled={!!linkedReservationId}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  {equipmentsList.map((eq) => (
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
                  disabled={!!linkedReservationId}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
              {linkedReservationId && (
                <p className="col-span-2 -mt-1 text-[11px] text-neutral-400">
                  Equipamento e data vieram da pré-reserva vinculada. Clique em "desvincular" acima para escolher outros.
                </p>
              )}
            </div>
          )}

          {/* ---- Contagem do equipamento / pacientes modelo ---- */}
          <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-neutral-800/40">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              {isMentoria ? "Pacientes modelo" : "Contagem do equipamento"}
            </p>

            {isMentoria ? (
              <div>
                <input
                  inputMode="numeric"
                  value={patientCount}
                  onChange={(e) => setPatientCount(onlyDigits(e.target.value))}
                  placeholder="Ex: 1"
                  className="w-full max-w-[140px] rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                <p className="mt-1 text-xs text-neutral-400">Normalmente 1 (individual); já aconteceu até 3 na mesma mentoria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-teal">Valor inicial</label>
                  <input
                    inputMode="numeric"
                    value={initialCount}
                    onChange={(e) => setInitialCount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
                <span className="pb-2 text-neutral-400">→</span>
                <div>
                  <label className="mb-1 block text-xs font-medium text-brand-pink">Valor final</label>
                  <input
                    inputMode="numeric"
                    value={finalCount}
                    onChange={(e) => setFinalCount(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ---- Resumo do cálculo ---- */}
          {(pricing || mentoriaCalc) && (
            <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-neutral-800/40">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Resumo do cálculo</p>

              {isMentoria && mentoriaCalc ? (
                <div className="rounded-xl bg-brand-lilac/10 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-600 dark:text-neutral-300">Valor da mentoria</span>
                    <span className="font-semibold text-brand-lilac">{formatCurrency(mentoriaCalc.totalValue)}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {mentoriaCalc.patientCount} paciente(s) x {formatCurrency(mentoriaCalc.unitValue)}
                    {mentoriaCalc.isParcelado ? " (parcelado no crédito até 10x)" : " (à vista)"}
                  </p>
                </div>
              ) : (
                pricing && (
                  <>
                    <div className="mb-3 flex items-center justify-between text-sm">
                      <span className="text-neutral-500 dark:text-neutral-400">Disparos realizados</span>
                      <span className="font-semibold text-neutral-700 dark:text-neutral-200">{shots.toLocaleString("pt-BR")}</span>
                    </div>
                    <div className="rounded-xl bg-brand-teal/10 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600 dark:text-neutral-300">Valor dos disparos (tabela)</span>
                        <span className="font-semibold text-brand-teal">{formatCurrency(pricing.totalValue)}</span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        Pacote fixo até {pricing.config.flatPackageLimit.toLocaleString("pt-BR")}: {formatCurrency(pricing.flatPackageValue)}
                        {pricing.tier2Portion > 0 && ` · +${pricing.tier2Portion.toLocaleString("pt-BR")} a R$${pricing.config.tier2Rate.toFixed(2)}`}
                        {pricing.tier3Portion > 0 && ` · +${pricing.tier3Portion.toLocaleString("pt-BR")} a R$${pricing.config.tier3Rate.toFixed(2)}`}
                      </p>
                    </div>

                    {/* Custo por disparo negociado manualmente */}
                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                        <input
                          type="checkbox"
                          checked={usarCustoManual}
                          onChange={(e) => setUsarCustoManual(e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-300"
                        />
                        Inserir valor manualmente (negociado por disparo)
                      </label>
                      {usarCustoManual && (
                        <div className="mt-2">
                          <input
                            inputMode="numeric"
                            value={custoManualInput}
                            onChange={(e) => setCustoManualInput(onlyDigits(e.target.value))}
                            placeholder="Ex: 9 = R$ 0,09"
                            className="w-full max-w-[180px] rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          />
                          {custoManualPorDisparo != null && resumo && (
                            <div className="mt-2 space-y-1 rounded-lg border border-dashed border-brand-teal/30 bg-brand-teal/5 p-2.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Custo negociado</span>
                                <span className="font-medium">R$ {custoManualPorDisparo.toFixed(2)} / disparo</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Valor com custo negociado</span>
                                <span className="font-medium">{formatCurrency(resumo.subtotalProduto)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Valor pela tabela normal</span>
                                <span className="font-medium">{formatCurrency(resumo.subtotalTabela)}</span>
                              </div>
                              <div className="flex justify-between border-t border-dashed border-brand-teal/30 pt-1 font-semibold text-brand-teal">
                                <span>Economia do cliente</span>
                                <span>{formatCurrency(resumo.economiaCustoManual)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )
              )}

              {/* Deslocamento */}
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Deslocamento — km de ida</label>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={kmIda}
                    onChange={(e) => setKmIda(onlyDigits(e.target.value))}
                    placeholder="0"
                    className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  {valorDeslocamentoPreview > 0 && (
                    <span className="text-xs text-neutral-500">
                      {kmIdaNumber} km ida · {kmIdaNumber * 2} km ida e volta = <strong>{formatCurrency(valorDeslocamentoPreview)}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ---- Ajustes finais ---- */}
          {resumo && (
            <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-neutral-800/40">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Ajustes finais</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-600">+ Aluguel</label>
                  <input
                    inputMode="decimal"
                    value={aluguelValor}
                    onChange={(e) => setAluguelValor(e.target.value)}
                    placeholder="R$ 0,00"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-brand-pink">- Desconto</label>
                    <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
                      <button
                        type="button"
                        onClick={() => setDescontoTipo("valor")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${descontoTipo === "valor" ? "bg-brand-teal text-white" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        R$
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescontoTipo("percentual")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${descontoTipo === "percentual" ? "bg-brand-teal text-white" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        %
                      </button>
                    </div>
                  </div>
                  <input
                    inputMode="decimal"
                    value={descontoValor}
                    onChange={(e) => setDescontoValor(e.target.value)}
                    placeholder={descontoTipo === "percentual" ? "Ex: 10" : "R$ 0,00"}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                </div>
              </div>

              {/* Itens personalizados */}
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">Itens personalizados</p>
                <div className="space-y-2">
                  <input
                    value={novoItemDesc}
                    onChange={(e) => setNovoItemDesc(e.target.value)}
                    placeholder="Descrição (ex: Insumo extra)"
                    maxLength={40}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <div className="flex gap-2">
                    <input
                      inputMode="decimal"
                      value={novoItemValor}
                      onChange={(e) => setNovoItemValor(e.target.value)}
                      placeholder="R$ 0,00"
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <div className="flex rounded-lg border border-neutral-300 p-0.5 dark:border-neutral-700">
                      <button
                        type="button"
                        onClick={() => setNovoItemTipo("mais")}
                        className={`rounded px-2.5 py-1 text-sm font-medium transition ${novoItemTipo === "mais" ? "bg-brand-teal text-white" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setNovoItemTipo("menos")}
                        className={`rounded px-2.5 py-1 text-sm font-medium transition ${novoItemTipo === "menos" ? "bg-brand-pink text-white" : "text-neutral-500 dark:text-neutral-400"}`}
                      >
                        −
                      </button>
                    </div>
                    <button type="button" onClick={addItemPersonalizado} className="rounded-lg border border-brand-teal px-3 text-xs font-medium text-brand-teal">
                      + Add
                    </button>
                  </div>
                </div>
                {itensPersonalizados.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {itensPersonalizados.map((it) => (
                      <li key={it.id} className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-300">
                        <span>
                          {it.tipo === "mais" ? "+" : "−"} {it.desc}: {formatCurrency(it.valor)}
                        </span>
                        <button type="button" onClick={() => removeItemPersonalizado(it.id)} className="text-neutral-400 hover:text-red-500">
                          remover
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(feePending || feeWouldApplyOnCreate) && (
                <div className="mt-3">
                  <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    <input type="checkbox" checked={chargeFeeNow} onChange={(e) => setChargeFeeNow(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
                    Cobrar taxa de reserva agora ({formatCurrency(fee)})
                  </label>
                </div>
              )}

              <div className="mt-4 rounded-xl bg-neutral-900 p-3 text-sm text-white">
                <div className="flex items-center justify-between">
                  <span>Total a cobrar do cliente</span>
                  <span className="text-lg font-semibold">{formatCurrency(resumo.totalAPagarAgora)}</span>
                </div>
              </div>

              {previewWhatsappText && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">Envie os cálculos para o cliente conferir antes de registrar o pagamento.</p>
                  <div className="flex gap-2">
                    {previewWhatsappLink && (
                      <button
                        type="button"
                        onClick={() => openInNewTab(previewWhatsappLink)}
                        className="flex-1 rounded-xl bg-brand-teal py-2 text-sm font-medium text-white transition hover:bg-brand-teal-dark"
                      >
                        Enviar para conferir no WhatsApp
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleCopyPreview}
                      className="flex-1 rounded-xl border border-neutral-300 py-2 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      {previewCopied ? "Copiado!" : "Copiar texto"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---- Pagamento ---- */}
          {resumo && (
            <div className="rounded-2xl bg-white/60 p-4 shadow-sm dark:bg-neutral-800/40">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Pagamento</p>

              {pagamentos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-500 dark:border-neutral-700">
                  Esta locação fica em aberto — nada será registrado como pago agora.
                  <button type="button" onClick={addPagamento} className="mt-2 block w-full rounded-lg border border-brand-teal py-1.5 font-medium text-brand-teal">
                    + Adicionar um pagamento
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagamentos.map((p, idx) => (
                    <div key={p.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-medium text-neutral-500">Pagamento {idx + 1}</span>
                        {pagamentos.length > 1 && (
                          <button type="button" onClick={() => removePagamento(p.id)} className="text-xs text-neutral-400 hover:text-red-500">
                            remover
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={p.forma}
                          onChange={(e) => updatePagamento(p.id, { forma: e.target.value, pixConta: e.target.value === "pix" ? p.pixConta || "harmonize" : "" })}
                          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        >
                          {PAYMENT_METHODS.map((pm) => (
                            <option key={pm.value} value={pm.value}>
                              {pm.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-1">
                          <input
                            inputMode="decimal"
                            value={p.valor || ""}
                            onChange={(e) => updatePagamento(p.id, { valor: parseDecimal(e.target.value) })}
                            placeholder="R$ 0,00"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          />
                          <button
                            type="button"
                            title="Preencher com o total"
                            onClick={() => preencherValorTotal(p.id)}
                            className="rounded-lg border border-neutral-300 px-2 text-xs text-neutral-500 dark:border-neutral-700"
                          >
                            tot.
                          </button>
                        </div>
                      </div>
                      {p.forma === "pix" && (
                        <select
                          value={p.pixConta}
                          onChange={(e) => updatePagamento(p.id, { pixConta: e.target.value as PixContaValue })}
                          className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        >
                          <option value="">Conta PIX que recebeu...</option>
                          {PIX_CONTAS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      <div className="mt-2">
                        <label className="mb-1 block text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                          Data em que caiu/recebeu (não precisa ser o dia do HIPRO)
                        </label>
                        <input
                          type="date"
                          value={p.data}
                          onChange={(e) => updatePagamento(p.id, { data: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        />
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button type="button" onClick={addPagamento} className="flex-1 rounded-lg border border-brand-teal py-2 text-xs font-medium text-brand-teal">
                      + Outro pagamento (parcial)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPagamentos([])}
                      className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs font-medium text-neutral-500 dark:border-neutral-700"
                    >
                      Deixar em aberto
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Soma dos pagamentos: {formatCurrency(somaPagamentos)}</span>
                    {saldoAposPagamentos > 0.009 && <span className="font-medium text-amber-600">Saldo em aberto: {formatCurrency(saldoAposPagamentos)}</span>}
                    {saldoAposPagamentos < -0.009 && <span className="font-medium text-red-500">Excedeu o total em {formatCurrency(-saldoAposPagamentos)}</span>}
                  </div>
                </div>
              )}
            </div>
          )}

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

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !podeSalvar}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
