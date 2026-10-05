"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ConfirmarExclusaoModal from "@/components/ConfirmarExclusaoModal";
import CalculadoraLocacaoModal from "@/components/CalculadoraLocacaoModal";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import DespesasDaReserva from "@/components/DespesasDaReserva";
import ReceberPagamentoBotao from "@/components/ReceberPagamentoBotao";
import TaxaRecebidaBotao from "@/components/TaxaRecebidaBotao";
import GerarContratoModal, { type OrigemContrato } from "@/components/GerarContratoModal";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PricingConfig, MentoriaPricingConfig } from "@/lib/rental-pricing";
import { valorParaNumero } from "@/lib/valor";
import { duracaoEmDias, somarDias } from "@/lib/period";

const EQUIPMENT_LABELS: Record<string, string> = {
  hipro_1: "HIPRO 1",
  hipro_2: "HIPRO 2",
};

interface EventToEdit {
  id: string;
  event_type: string;
  title: string;
  date_start: string;
  // Data final quando a reserva cobre mais de um dia.
  date_end?: string | null;
  status?: string;
  client_id: string | null;
  equipment_id?: string | null;
  rental_id: string | null;
  notes?: string | null;
  clients?: { name: string; whatsapp?: string | null } | null;
  taxa_status?: string | null;
  is_mentoria?: boolean;
  contagem_inicial?: number | null;
  contagem_inicial_em?: string | null;
}

interface EquipamentoContratoInfo {
  name: string;
  serial_number?: string | null;
  anvisa_registro?: string | null;
}

interface ClienteContratoInfo {
  id: string;
  name: string;
  email?: string | null;
  document?: string | null;
  address?: string | null;
  display_name?: string | null;
  contrato_nome?: string | null;
  contrato_endereco?: string | null;
}

interface RentalDetails {
  id: string;
  event_date: string;
  event_date_end: string | null;
  shots: number;
  calculated_value: number;
  payment_method: string;
  equipment_id: string;
  km_ida: number | null;
  valor_deslocamento: number;
  deslocamento_incluso_no_valor: boolean;
  equipments: EquipamentoContratoInfo | null;
}

export default function EditarEventoModal({
  event,
  clients,
  pricingConfig,
  reservationFee,
  mentoriaPricing,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: EventToEdit;
  clients: ClientOption[];
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  mentoriaPricing?: MentoriaPricingConfig;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const isRentalEvent = !!event.rental_id;
  const isPendingReservation = !isRentalEvent && !!event.equipment_id && (event.status ?? "pre_reserva") === "pre_reserva";

  const [showFinalize, setShowFinalize] = useState(false);

  // Contagem inicial do equipamento guardada na reserva (dia da entrega), para
  // fechar a conta depois só com a contagem final.
  const [contagemSalva, setContagemSalva] = useState<number | null>(
    event.contagem_inicial != null ? Number(event.contagem_inicial) : null
  );
  const [contagemTexto, setContagemTexto] = useState(
    event.contagem_inicial != null ? String(event.contagem_inicial) : ""
  );
  const [salvandoContagem, setSalvandoContagem] = useState(false);
  const [contagemErro, setContagemErro] = useState<string | null>(null);
  const [contagemOk, setContagemOk] = useState<string | null>(null);

  async function salvarContagemInicial(apagar: boolean) {
    const numero = apagar ? null : Number(contagemTexto.replace(/\D/g, ""));
    if (!apagar && (!contagemTexto.trim() || !Number.isFinite(numero) || (numero as number) < 0)) {
      setContagemErro("Digite a contagem inicial do equipamento.");
      return;
    }
    setSalvandoContagem(true);
    setContagemErro(null);
    setContagemOk(null);
    const { error: rpcError } = await supabase.rpc("definir_contagem_inicial_reserva", {
      p_event_id: event.id,
      p_contagem: numero,
    });
    setSalvandoContagem(false);
    if (rpcError) {
      setContagemErro(rpcError.message || "Não foi possível salvar a contagem inicial.");
      return;
    }
    setContagemSalva(numero);
    if (apagar) setContagemTexto("");
    setContagemOk(apagar ? "Contagem inicial apagada." : "Contagem inicial salva.");
    router.refresh();
  }
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelNoShow, setCancelNoShow] = useState(false);
  const [title, setTitle] = useState(event.title);
  const [localClients, setLocalClients] = useState(clients);
  const [clientId, setClientId] = useState(event.client_id ?? "");
  const [dateStart, setDateStart] = useState(event.date_start);
  const [notes, setNotes] = useState(event.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  // Reagendar (só para pré-reserva): troca a data sem cancelar nada, via
  // RPC reagendar_agendamento — mesma função já usada na ficha do cliente.
  const [showReagendar, setShowReagendar] = useState(false);
  const [novaData, setNovaData] = useState(event.date_start);
  // Data final (opcional). Em branco, o período se mantém com a mesma duração.
  const [novaDataFim, setNovaDataFim] = useState("");
  const duracaoAtual = duracaoEmDias(event.date_start, event.date_end);
  const [reagendando, setReagendando] = useState(false);
  const [reagendarError, setReagendarError] = useState<string | null>(null);

  async function handleReagendar() {
    if (!novaData) {
      setReagendarError("Escolha a nova data.");
      return;
    }
    if (novaDataFim && novaDataFim < novaData) {
      setReagendarError("A data final não pode ser antes da data inicial.");
      return;
    }
    setReagendando(true);
    setReagendarError(null);
    const { error } = await supabase.rpc("reagendar_agendamento", {
      p_event_id: event.id,
      p_nova_data: novaData,
      ...(novaDataFim ? { p_nova_data_fim: novaDataFim } : {}),
    });
    setReagendando(false);
    if (error) {
      setReagendarError(error.message || "Não foi possível reagendar. Tente novamente.");
      return;
    }
    onSaved();
  }

  const [contratoState, setContratoState] = useState<{ origem: OrigemContrato; client: ClienteContratoInfo } | null>(
    null
  );
  const [loadingContrato, setLoadingContrato] = useState(false);
  const [contratoError, setContratoError] = useState<string | null>(null);

  const [rentalDetails, setRentalDetails] = useState<RentalDetails | null>(null);
  const [loadingRental, setLoadingRental] = useState(false);
  const [valorDeslocamento, setValorDeslocamento] = useState("");
  const [kmIda, setKmIda] = useState("");
  const [inclusoNoValor, setInclusoNoValor] = useState(false);

  // Saldo em aberto da locação (view rentals_situacao_pagamento): mostra
  // quanto falta e deixa receber sem sair da Agenda.
  const [saldoLocacao, setSaldoLocacao] = useState<number | null>(null);
  const [recarregarSaldo, setRecarregarSaldo] = useState(0);
  useEffect(() => {
    if (!event.rental_id) return;
    let ativo = true;
    supabase
      .from("rentals_situacao_pagamento")
      .select("saldo")
      .eq("rental_id", event.rental_id)
      .maybeSingle()
      .then(({ data }) => {
        if (ativo) setSaldoLocacao(data ? Number(data.saldo) : null);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.rental_id, recarregarSaldo]);
  const [savingDeslocamento, setSavingDeslocamento] = useState(false);
  const [deslocamentoError, setDeslocamentoError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRentalEvent || !event.rental_id) return;
    let active = true;
    setLoadingRental(true);
    supabase
      .from("rentals")
      .select(
        "id, event_date, event_date_end, shots, calculated_value, payment_method, equipment_id, km_ida, valor_deslocamento, deslocamento_incluso_no_valor, equipments(name, serial_number, anvisa_registro)"
      )
      .eq("id", event.rental_id)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setLoadingRental(false);
        if (data) {
          const normalized: RentalDetails = {
            ...(data as any),
            equipments: Array.isArray((data as any).equipments)
              ? ((data as any).equipments[0] ?? null)
              : ((data as any).equipments ?? null),
          };
          setRentalDetails(normalized);
          setKmIda(normalized.km_ida ? String(normalized.km_ida) : "");
          setInclusoNoValor(!!normalized.deslocamento_incluso_no_valor);
          setValorDeslocamento(normalized.valor_deslocamento ? String(normalized.valor_deslocamento).replace(".", ",") : "");
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRentalEvent, event.rental_id]);

  const kmIdaNumber = Number(kmIda.replace(/\D/g, "")) || 0;
  const valorDeslocamentoNumber = valorParaNumero(valorDeslocamento) || 0;

  async function handleSalvarDeslocamento() {
    if (!event.rental_id) return;
    setSavingDeslocamento(true);
    setDeslocamentoError(null);
    const { error } = await supabase.rpc("definir_deslocamento_locacao", {
      p_rental_id: event.rental_id,
      p_km_ida: kmIdaNumber > 0 ? kmIdaNumber : null,
      p_valor_deslocamento: valorDeslocamentoNumber,
      p_incluso_no_valor: inclusoNoValor,
    });
    setSavingDeslocamento(false);
    if (error) {
      setDeslocamentoError("Não foi possível salvar o deslocamento. Tente novamente.");
      return;
    }
    onSaved();
  }

  const [loadingReservaDeslocamento, setLoadingReservaDeslocamento] = useState(false);
  const [valorDeslocamentoReserva, setValorDeslocamentoReserva] = useState("");
  const [kmIdaReserva, setKmIdaReserva] = useState("");
  const [savingDeslocamentoReserva, setSavingDeslocamentoReserva] = useState(false);
  const [deslocamentoReservaError, setDeslocamentoReservaError] = useState<string | null>(null);

  useEffect(() => {
    if (!isPendingReservation) return;
    let active = true;
    setLoadingReservaDeslocamento(true);
    supabase
      .from("calendar_events")
      .select("km_ida, valor_deslocamento")
      .eq("id", event.id)
      .single()
      .then(({ data }) => {
        if (!active) return;
        setLoadingReservaDeslocamento(false);
        if (data) {
          setKmIdaReserva(data.km_ida ? String(data.km_ida) : "");
          setValorDeslocamentoReserva(data.valor_deslocamento ? String(data.valor_deslocamento).replace(".", ",") : "");
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPendingReservation, event.id]);

  const kmIdaReservaNumber = Number(kmIdaReserva.replace(/\D/g, "")) || 0;
  const valorDeslocamentoReservaNumber = valorParaNumero(valorDeslocamentoReserva) || 0;

  async function handleSalvarDeslocamentoReserva() {
    setSavingDeslocamentoReserva(true);
    setDeslocamentoReservaError(null);
    const { error } = await supabase.rpc("definir_deslocamento_reserva", {
      p_event_id: event.id,
      p_km_ida: kmIdaReservaNumber > 0 ? kmIdaReservaNumber : null,
      p_valor_deslocamento: valorDeslocamentoReservaNumber,
    });
    setSavingDeslocamentoReserva(false);
    if (error) {
      setDeslocamentoReservaError("Não foi possível salvar o deslocamento. Tente novamente.");
      return;
    }
    onSaved();
  }

  async function handleCancelReservation() {
    setCancelling(true);
    setCancelError(null);
    const { error } = await supabase.rpc("cancelar_agendamento", {
      p_event_id: event.id,
      p_motivo: cancelMotivo || null,
      p_no_show: cancelNoShow,
    });
    setCancelling(false);
    if (error) {
      setCancelError(error.message || "Não foi possível cancelar. Tente novamente.");
      return;
    }
    onDeleted();
  }

  async function handleAbrirContratoReserva() {
    if (!event.client_id) {
      setContratoError("Este agendamento não tem cliente vinculado.");
      return;
    }
    setLoadingContrato(true);
    setContratoError(null);
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, name, email, document, address, display_name, contrato_nome, contrato_endereco")
      .eq("id", event.client_id)
      .single();
    const { data: equipmentData } = event.equipment_id
      ? await supabase
          .from("equipments")
          .select("name, serial_number, anvisa_registro")
          .eq("id", event.equipment_id)
          .single()
      : { data: null as EquipamentoContratoInfo | null };
    const { data: eventData } = await supabase.from("calendar_events").select("date_end").eq("id", event.id).single();
    setLoadingContrato(false);
    if (!clientData) {
      setContratoError("Não foi possível carregar os dados do cliente.");
      return;
    }
    setContratoState({
      client: clientData,
      origem: {
        kind: "reserva",
        reserva: {
          id: event.id,
          event_date: event.date_start,
          event_date_end: eventData?.date_end ?? null,
          equipment_id: event.equipment_id ?? "",
          equipments: equipmentData ?? null,
        },
      },
    });
  }

  async function handleAbrirContratoRental() {
    if (!event.client_id || !rentalDetails) {
      setContratoError("Ainda carregando os dados da locação. Tente de novo em instantes.");
      return;
    }
    setLoadingContrato(true);
    setContratoError(null);
    const { data: clientData } = await supabase
      .from("clients")
      .select("id, name, email, document, address, display_name, contrato_nome, contrato_endereco")
      .eq("id", event.client_id)
      .single();
    setLoadingContrato(false);
    if (!clientData) {
      setContratoError("Não foi possível carregar os dados do cliente.");
      return;
    }
    setContratoState({
      client: clientData,
      origem: {
        kind: "rental",
        rental: {
          id: rentalDetails.id,
          event_date: rentalDetails.event_date,
          event_date_end: rentalDetails.event_date_end,
          shots: rentalDetails.shots,
          calculated_value: rentalDetails.calculated_value,
          payment_method: rentalDetails.payment_method,
          equipment_id: rentalDetails.equipment_id,
          equipments: rentalDetails.equipments,
        },
      },
    });
  }

  if (contratoState) {
    return (
      <GerarContratoModal
        origem={contratoState.origem}
        client={contratoState.client}
        pricingConfig={pricingConfig}
        onClose={() => setContratoState(null)}
      />
    );
  }

  if (isPendingReservation) {
    if (showFinalize) {
      return (
        <CalculadoraLocacaoModal
          mode={{
            kind: "finalize",
            reservation: {
              id: event.id,
              clientId: event.client_id ?? "",
              clientName: event.clients?.name ?? "Cliente",
              clientWhatsapp: event.clients?.whatsapp ?? null,
              taxaStatus: event.taxa_status,
              equipmentName: EQUIPMENT_LABELS[event.event_type] ?? event.event_type,
              eventDate: event.date_start,
              contagemInicial: contagemSalva,
            },
            isMentoria: event.is_mentoria ?? false,
          }}
          pricingConfig={pricingConfig}
          reservationFee={reservationFee}
          mentoriaPricing={mentoriaPricing}
          onClose={() => setShowFinalize(false)}
          onDone={onSaved}
        />
      );
    }

    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {event.is_mentoria ? "Mentoria pendente" : "Reserva pendente"}
          </h2>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            {EQUIPMENT_LABELS[event.event_type] ?? event.event_type} · {formatDate(event.date_start)}
            {event.date_end && event.date_end > event.date_start ? ` a ${formatDate(event.date_end)}` : ""}
            {event.clients?.name ? ` · ${event.clients.name}` : ""}
            <br />
            {event.is_mentoria
              ? "Ainda sem cobrança lançada. Finalize com a quantidade de pacientes modelo quando a mentoria acontecer, ou cancele se não for mais rolar."
              : "Ainda sem contagem de disparos. Finalize quando o procedimento acontecer, ou cancele se não for mais rolar."}
          </p>

          {cancelError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{cancelError}</p>}

          {showCancelForm ? (
            <div className="rounded-xl border border-red-200 p-3 dark:border-red-900/50">
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={cancelNoShow}
                  onChange={(e) => setCancelNoShow(e.target.checked)}
                />
                O cliente não compareceu (no-show)
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setShowCancelForm(false)}
                  className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancelReservation}
                  disabled={cancelling}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-medium text-white disabled:opacity-60"
                >
                  {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              </div>
            </div>
          ) : showReagendar ? (
            <div className="rounded-xl border border-brand-teal/40 p-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Nova data
              </label>
              <input
                type="date"
                value={novaData}
                onChange={(e) => setNovaData(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <label className="mb-1 mt-3 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Data final (opcional)
              </label>
              <input
                type="date"
                value={novaDataFim}
                min={novaData}
                onChange={(e) => setNovaDataFim(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <p className="mt-1 text-[11px] text-neutral-400">
                {duracaoAtual > 1
                  ? `Hoje a reserva tem ${duracaoAtual} dias. Em branco, ela mantém os ${duracaoAtual} dias a partir da nova data.`
                  : "Em branco, a reserva continua de um dia só. Preencha para ela cobrir mais de um dia (uma taxa só)."}
              </p>
              {reagendarError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{reagendarError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setShowReagendar(false);
                    setReagendarError(null);
                  }}
                  className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Voltar
                </button>
                <button
                  onClick={handleReagendar}
                  disabled={reagendando}
                  className="flex-1 rounded-xl bg-brand-gradient py-2 text-xs font-medium text-white disabled:opacity-60"
                >
                  {reagendando ? "Movendo..." : "Mover para esta data"}
                </button>
              </div>
            </div>
          ) : (
            <>
              {event.taxa_status === "pendente" && !event.is_mentoria && (
                <div className="mb-3">
                  <TaxaRecebidaBotao eventId={event.id} onDone={onSaved} />
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Fechar
                </button>
                <button
                  onClick={() => setShowFinalize(true)}
                  className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
                >
                  {event.is_mentoria ? "Finalizar mentoria" : "Finalizar com disparos"}
                </button>
              </div>

              <button
                onClick={() => {
                  setShowReagendar(true);
                  setNovaData(event.date_start);
                  setNovaDataFim("");
                }}
                className="mt-3 w-full rounded-xl border border-brand-teal py-2.5 text-sm font-medium text-brand-teal"
              >
                Reagendar
              </button>

              {!event.is_mentoria && (
                <div className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
                  <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                    Contagem inicial do equipamento
                  </label>
                  <p className="mb-2 text-[11px] text-neutral-400">
                    Digite no dia da entrega. No dia de buscar, ao finalizar, ela já vem preenchida e falta só a final.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      inputMode="numeric"
                      value={contagemTexto}
                      onChange={(e) => {
                        setContagemTexto(e.target.value.replace(/\D/g, ""));
                        setContagemOk(null);
                      }}
                      placeholder="0"
                      aria-label="Contagem inicial do equipamento"
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      disabled={salvandoContagem}
                      onClick={() => salvarContagemInicial(false)}
                      className="rounded-lg bg-brand-teal px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {salvandoContagem ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                  {contagemSalva != null && (
                    <p className="mt-2 text-xs text-brand-teal">
                      Guardada: {contagemSalva.toLocaleString("pt-BR")}.{" "}
                      <button
                        type="button"
                        disabled={salvandoContagem}
                        onClick={() => salvarContagemInicial(true)}
                        className="text-neutral-500 underline underline-offset-2"
                      >
                        apagar
                      </button>
                    </p>
                  )}
                  {contagemOk && <p className="mt-1 text-xs text-brand-teal">{contagemOk}</p>}
                  {contagemErro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{contagemErro}</p>}
                </div>
              )}

              <div className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Ajuda de custo — deslocamento (opcional)
                </label>
                {loadingReservaDeslocamento ? (
                  <p className="text-xs text-neutral-400">Carregando...</p>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-neutral-500 dark:text-neutral-400">R$</span>
                      <input
                        inputMode="decimal"
                        value={valorDeslocamentoReserva}
                        onChange={(e) => setValorDeslocamentoReserva(e.target.value.replace(/[^\d,]/g, ""))}
                        placeholder="0,00"
                        className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                      />
                      <button
                        onClick={handleSalvarDeslocamentoReserva}
                        disabled={savingDeslocamentoReserva}
                        className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        {savingDeslocamentoReserva ? "Salvando..." : "Salvar"}
                      </button>
                    </div>
                    <p className="mt-1 text-xs text-neutral-400">
                      Valor que o cliente já pagou pelo deslocamento, mesmo antes do procedimento. Ao finalizar a
                      reserva, este valor segue junto para a locação.
                    </p>
                    <label className="mb-1 mt-2 block text-xs font-medium text-neutral-500 dark:text-neutral-500">
                      Km de ida (opcional, só para registro — não calcula o valor acima)
                    </label>
                    <input
                      inputMode="numeric"
                      value={kmIdaReserva}
                      onChange={(e) => setKmIdaReserva(e.target.value.replace(/\D/g, ""))}
                      placeholder="0"
                      className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </>
                )}
                {deslocamentoReservaError && (
                  <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deslocamentoReservaError}</p>
                )}
              </div>

              <DespesasDaReserva eventId={event.id} clientId={event.client_id} dataEvento={event.date_start} />

              {contratoError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{contratoError}</p>}

              <button
                onClick={handleAbrirContratoReserva}
                disabled={loadingContrato}
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
              >
                <FileText size={14} strokeWidth={1.75} />
                {loadingContrato ? "Carregando..." : "Gerar contrato"}
              </button>

              <button
                onClick={() => setShowCancelForm(true)}
                className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/50 dark:text-red-400"
              >
                Cancelar reserva
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  async function handleSave() {
    if (!title.trim() || !dateStart) {
      setError("Informe o título e a data.");
      return;
    }
    if (!window.confirm("Salvar essas alterações no evento?")) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("calendar_events")
      .update({
        title: title.trim(),
        client_id: clientId || null,
        date_start: dateStart,
        // Preserva a duração: mudar a data de um evento de vários dias não
        // pode encolhê-lo para um dia só.
        date_end: somarDias(dateStart, duracaoEmDias(event.date_start, event.date_end) - 1),
        notes: notes || null,
      })
      .eq("id", event.id);
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSaved();
  }

  if (isRentalEvent) {
    return (
      <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{event.title}</h2>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Este evento veio de uma locação HIPRO. Para editar cliente, data, equipamento, disparos ou valor, isso é
            feito na própria locação (na ficha do cliente), para manter o financeiro e a agenda sincronizados.
          </p>

          {saldoLocacao !== null && (
            <div className="mb-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
              {saldoLocacao > 0.009 ? (
                <>
                  <p className="mb-2 text-sm text-amber-700 dark:text-amber-400">
                    Falta receber {formatCurrency(saldoLocacao)}.
                  </p>
                  <ReceberPagamentoBotao
                    rentalId={event.rental_id as string}
                    saldo={saldoLocacao}
                    onDone={() => {
                      setRecarregarSaldo((n) => n + 1);
                      onSaved();
                    }}
                  />
                </>
              ) : (
                <p className="text-sm text-brand-teal">Locação paga.</p>
              )}
            </div>
          )}

          <div className="mb-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Ajuda de custo — deslocamento (opcional)
            </label>
            {loadingRental ? (
              <p className="text-xs text-neutral-400">Carregando...</p>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-500 dark:text-neutral-400">R$</span>
                  <input
                    inputMode="decimal"
                    value={valorDeslocamento}
                    onChange={(e) => setValorDeslocamento(e.target.value.replace(/[^\d,]/g, ""))}
                    placeholder="0,00"
                    className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <button
                    onClick={handleSalvarDeslocamento}
                    disabled={savingDeslocamento}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    {savingDeslocamento ? "Salvando..." : "Salvar"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  Valor que o cliente pagou de ajuda de custo pelo deslocamento, cobrado à parte do valor da locação.
                  Entra no financeiro como entrada "Deslocamento" (mesma forma de pagamento e data da locação), mas não
                  conta no faturamento. Deixe em branco (ou zere) para remover.
                </p>
                {valorDeslocamentoNumber > 0 && (
                  <label className="mt-2 flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                    <input
                      type="checkbox"
                      checked={inclusoNoValor}
                      onChange={(e) => setInclusoNoValor(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      Esse valor já está somado no valor da locação (veio da calculadora). Marcado, não lança no
                      financeiro, para não contar duas vezes.
                    </span>
                  </label>
                )}
                <label className="mb-1 mt-2 block text-xs font-medium text-neutral-500 dark:text-neutral-500">
                  Km de ida (opcional, só para registro — não calcula o valor acima)
                </label>
                <input
                  inputMode="numeric"
                  value={kmIda}
                  onChange={(e) => setKmIda(e.target.value.replace(/\D/g, ""))}
                  placeholder="0"
                  className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </>
            )}
            {deslocamentoError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deslocamentoError}</p>}
          </div>

          {contratoError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{contratoError}</p>}

          <button
            onClick={handleAbrirContratoRental}
            disabled={loadingContrato || loadingRental}
            className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-neutral-200 py-2.5 text-sm font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
          >
            <FileText size={14} strokeWidth={1.75} />
            {loadingContrato ? "Carregando..." : "Gerar contrato"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Fechar
            </button>
            {event.client_id && (
              <Link
                href={`/clientes/${event.client_id}`}
                className="flex-1 rounded-xl bg-brand-teal py-2.5 text-center text-sm font-medium text-white transition hover:bg-brand-teal-dark"
              >
                Ir para a locação
              </Link>
            )}
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
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar evento</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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

        <button
          onClick={() => setConfirmarExclusao(true)}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/50 dark:text-red-400"
        >
          Excluir evento
        </button>

        {confirmarExclusao && (
          <ConfirmarExclusaoModal
            table="calendar_events"
            id={event.id}
            onCancel={() => setConfirmarExclusao(false)}
            onDeleted={() => {
              setConfirmarExclusao(false);
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}
