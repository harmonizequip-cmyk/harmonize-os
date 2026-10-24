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
  ordenarContagens,
  valorDosDisparos,
  descontarTaxaDosPagamentos,
  type ItemAjuste,
  type PagamentoLinha,
  type PixContaValue,
  type ReservationFeeStatus,
} from "@/lib/rental-calculator";
import { formatCurrency, formatDate, buildWhatsAppLink } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { usePreferencias } from "@/lib/usar-preferencias";
import { valorParaNumero, lerCustoPorDisparo, limparCampoCustoPorDisparo } from "@/lib/valor";
import CalculoImagemBotao from "@/components/CalculoImagemBotao";
import { montarDadosCalculo, montarDadosMentoria } from "@/lib/calculo-image";
import { avisar as avisarApp, confirmar as confirmarApp } from "@/components/Dialogos";
import { somarContagens, creditoUsavel, disparosCobrados, type Contagem } from "@/lib/creditos";

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
  return valorParaNumero(v) || 0;
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
  isento_taxa?: boolean | null;
}

interface PendingReservation {
  id: string;
  equipment_id: string | null;
  date_start: string;
  equipmentName: string;
  contagemInicial: number | null;
}

// Uma contagem como digitada na tela (texto cru; a menor leitura vale como inicial).
interface ContagemTela {
  id: string;
  inicial: string;
  final: string;
  geraCredito: boolean;
  // Ponteira (aplicador) usada nesta contagem. undefined = ainda não mexeu:
  // a primeira contagem assume a ponteira montada no HIPRO da locação.
  aplicadorId?: string;
  padraoMontada?: boolean;
}

interface AplicadorOpcao {
  id: string;
  nome: string;
  numero_serie: string | null;
}

// Linha de pagamento da tela: as de permuta levam o que veio e para onde vai.
interface PagamentoTela extends PagamentoLinha {
  permutaDescricao?: string;
  permutaDestino?: "empresa" | "pessoal";
  permutaCategoria?: string;
}

// Formas da finalização: as de sempre e a permuta (parceiro paga com produto/serviço).
const FORMAS_PAGAMENTO_LOCACAO: { value: string; label: string }[] = [
  ...PAYMENT_METHODS.map((p) => ({ value: p.value as string, label: p.label as string })),
  { value: "permuta", label: "Permuta" },
];

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
        // Contagem inicial do equipamento guardada na reserva (dia da entrega).
        contagemInicial?: number | null;
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
  // Cliente isenta da taxa (clients.isento_taxa) também não paga, como o parceiro. Nem toda tela
  // manda esse campo na lista, então confere no cadastro (mesma regra de definir_taxa_ao_criar_evento).
  const [activeClientIsenta, setActiveClientIsenta] = useState(false);
  useEffect(() => {
    let active = true;
    setActiveClientIsenta(mode.kind === "create" && !mode.clientId ? !!pickedClient?.isento_taxa : false);
    if (mode.kind !== "create" || !activeClientId) return;
    supabase
      .from("clients")
      .select("parceiro, isento_taxa")
      .eq("id", activeClientId)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setActiveClientIsenta(!!data.parceiro || !!data.isento_taxa);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId, mode.kind]);

  // ------------------------------------------------------------
  // Equipamento e data
  // ------------------------------------------------------------
  const equipmentsList = mode.kind === "create" ? mode.equipments : [];
  const [equipmentId, setEquipmentId] = useState(equipmentsList[0]?.id ?? "");
  const [eventDate, setEventDate] = useState(() =>
    mode.kind === "finalize" ? mode.reservation.eventDate : hojeLocal()
  );
  // Leva W: período de vários dias. Só existe no modo "create" (locação
  // lançada direto, sem passar por pré-reserva de um dia específico da
  // Agenda) — é a exceção, não a regra, por isso nasce fechado e o
  // usuário precisa marcar a caixinha para aparecer. Quando fechado,
  // eventDateEnd nunca é enviado (null = locação de um dia só).
  const [isPeriodo, setIsPeriodo] = useState(false);
  const [eventDateEnd, setEventDateEnd] = useState("");
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
      .select("id, equipment_id, date_start, contagem_inicial, equipments(name)")
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
            contagemInicial: r.contagem_inicial != null ? Number(r.contagem_inicial) : null,
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
    // Contagem inicial guardada na reserva: já entra preenchida (só se a
    // pessoa ainda não digitou outra).
    if (r.contagemInicial != null) {
      const salva = String(r.contagemInicial);
      setContagensTela((prev) => prev.map((c, i) => (i === 0 && !c.inicial ? { ...c, inicial: salva } : c)));
    }
    // Trocas de ponteira já feitas na reserva: traz as contagens fechadas.
    carregarContagensDaReserva(r.id);
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

  // E7: aviso (não bloqueia) quando o mesmo cliente já tem o OUTRO HIPRO
  // reservado no mesmo dia — mais provável de ser engano de digitação do
  // que dois procedimentos de verdade no mesmo dia. Só faz sentido em
  // "create": no "finalize" o cliente/equipamento/data já vêm de uma
  // reserva existente, que já passou por essa checagem quando foi criada.
  const [outroEquipAviso, setOutroEquipAviso] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setOutroEquipAviso(null);
    if (mode.kind !== "create" || !activeClientId || !equipmentId || !eventDate) return;
    supabase
      .from("calendar_events")
      .select("equipment_id, equipments(name)")
      .eq("client_id", activeClientId)
      .eq("date_start", eventDate)
      .neq("status", "cancelada")
      .not("equipment_id", "is", null)
      .neq("equipment_id", equipmentId)
      .limit(1)
      .then(({ data }) => {
        if (!active) return;
        const outro = data?.[0] as any;
        if (!outro) return;
        const outroNome = (Array.isArray(outro.equipments) ? outro.equipments[0] : outro.equipments)?.name ?? "outro equipamento";
        setOutroEquipAviso(`⚠️ ${activeClientName || "Este cliente"} já tem uma reserva no ${outroNome} neste mesmo dia. Confira se não é engano antes de continuar.`);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode.kind, activeClientId, equipmentId, eventDate]);

  // ------------------------------------------------------------
  // Contagem do equipamento (ou pacientes modelo, em mentoria)
  // ------------------------------------------------------------
  // Reserva com contagem inicial guardada: a calculadora abre com ela
  // preenchida, só falta digitar a contagem final.
  const contagemSalvaDaReserva = mode.kind === "finalize" ? (mode.reservation.contagemInicial ?? null) : null;
  // Lista de contagens: a primeira funciona como a contagem única de antes.
  // Trocou a ponteira/aplicador no meio? "+ Somar outra contagem" abre outra
  // (todas entram na soma); "Gerar crédito e continuar" marca a atual para
  // virar crédito da cliente (ela paga hoje e usa depois) e abre outra.
  const [contagensTela, setContagensTela] = useState<ContagemTela[]>(() => [
    {
      id: newId("cont"),
      inicial: contagemSalvaDaReserva != null ? String(contagemSalvaDaReserva) : "",
      final: "",
      geraCredito: false,
      padraoMontada: true,
    },
  ]);
  const [patientCount, setPatientCount] = useState("1");
  const [notes, setNotes] = useState("");

  // Trocas de ponteira feitas na reserva (antes de finalizar): as contagens
  // fechadas (reserva_contagens) entram completas e, por último, a contagem
  // aberta com a inicial e a ponteira atuais, faltando só a final.
  const [inicialAtualDaReserva, setInicialAtualDaReserva] = useState<number | null>(contagemSalvaDaReserva);
  async function carregarContagensDaReserva(eventId: string) {
    const [ev, rc] = await Promise.all([
      supabase.from("calendar_events").select("contagem_inicial, contagem_aplicador_id").eq("id", eventId).maybeSingle(),
      supabase
        .from("reserva_contagens")
        .select("ordem, inicial, final, gera_credito, aplicador_id")
        .eq("calendar_event_id", eventId)
        .order("ordem"),
    ]);
    if (ev.error || rc.error) return; // banco ainda sem as colunas: segue como antes
    const evRow = ev.data as { contagem_inicial: number | null; contagem_aplicador_id: string | null } | null;
    const fechadas = (rc.data ?? []) as {
      inicial: number;
      final: number;
      gera_credito: boolean;
      aplicador_id: string | null;
    }[];
    const inicialAtual = evRow?.contagem_inicial != null ? Number(evRow.contagem_inicial) : null;
    setInicialAtualDaReserva(inicialAtual);
    if (fechadas.length === 0 && !evRow?.contagem_aplicador_id) return;
    const lista: ContagemTela[] = fechadas.map((f) => ({
      id: newId("cont"),
      inicial: String(f.inicial),
      final: String(f.final),
      geraCredito: !!f.gera_credito,
      aplicadorId: f.aplicador_id ?? "",
    }));
    lista.push({
      id: newId("cont"),
      inicial: inicialAtual != null ? String(inicialAtual) : "",
      final: "",
      geraCredito: false,
      ...(evRow?.contagem_aplicador_id
        ? { aplicadorId: evRow.contagem_aplicador_id }
        : fechadas.length === 0
        ? { padraoMontada: true }
        : { aplicadorId: "" }),
    });
    // Só substitui se a pessoa ainda não digitou nenhuma contagem final.
    setContagensTela((prev) => (prev.every((c) => !onlyDigits(c.final)) ? lista : prev));
  }
  useEffect(() => {
    if (mode.kind !== "finalize" || isMentoria) return;
    carregarContagensDaReserva(mode.reservation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateContagem(id: string, patch: Partial<ContagemTela>) {
    setContagensTela((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }
  function addContagem(gerarCreditoDaAtual: boolean) {
    setContagensTela((prev) => {
      const lista = gerarCreditoDaAtual
        ? prev.map((c, i) => (i === prev.length - 1 ? { ...c, geraCredito: true } : c))
        : prev;
      return [...lista, { id: newId("cont"), inicial: "", final: "", geraCredito: false, aplicadorId: "" }];
    });
  }
  function removeContagem(id: string) {
    setContagensTela((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev));
  }

  // Em cada contagem, a menor leitura é sempre a inicial e a maior a final,
  // na ordem em que forem digitadas; os disparos são a diferença.
  const contagensCalc = useMemo(() => contagensTela.map((c) => {
    const preenchida = !!onlyDigits(c.inicial) && !!onlyDigits(c.final);
    const o = ordenarContagens(Number(onlyDigits(c.inicial)), Number(onlyDigits(c.final)));
    return {
      ...c,
      preenchida,
      inicialN: o.inicial,
      finalN: o.final,
      disparos: preenchida ? o.disparos : 0,
      invertidas: preenchida && o.invertidas,
    };
  }), [contagensTela]);
  const todasContagensPreenchidas = contagensCalc.every((c) => c.preenchida);
  const contagensParaSalvar: Contagem[] = useMemo(
    () =>
      contagensCalc
        .filter((c) => c.preenchida)
        .map((c) => ({ inicial: c.inicialN, final: c.finalN, gera_credito: c.geraCredito })),
    [contagensCalc]
  );
  const { total: totalDisparos, credito: disparosViraCredito } = somarContagens(contagensParaSalvar);
  // Para o texto e a imagem: início da primeira contagem e fim da última.
  const initialNumber = contagensCalc[0]?.inicialN ?? 0;
  const finalNumber = contagensCalc[contagensCalc.length - 1]?.finalN ?? 0;
  const patientCountNumber = Number(onlyDigits(patientCount)) || 0;

  // ------------------------------------------------------------
  // Ponteira (aplicador) de cada contagem e troca de ponteira no HIPRO
  // ------------------------------------------------------------
  const [aplicadores, setAplicadores] = useState<AplicadorOpcao[]>([]);
  // aplicador_id -> equipment_id onde está montado agora (ate nulo).
  const [montagens, setMontagens] = useState<Record<string, string>>({});
  const [nomesEquip, setNomesEquip] = useState<Record<string, string>>({});
  // No "finalize" a reserva não traz o equipamento: busca pelo agendamento.
  const [equipFinalizeId, setEquipFinalizeId] = useState<string | null>(null);
  const [registrarTroca, setRegistrarTroca] = useState(true);
  useEffect(() => {
    let active = true;
    if (isMentoria) return;
    Promise.all([
      supabase.from("aplicadores").select("id, nome, numero_serie").eq("ativo", true).order("nome"),
      supabase.from("aplicador_montagens").select("aplicador_id, equipment_id, equipments(name)").is("ate", null),
      mode.kind === "finalize"
        ? supabase.from("calendar_events").select("equipment_id").eq("id", mode.reservation.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([ap, mo, ev]) => {
      if (!active) return;
      setAplicadores((ap.data ?? []) as AplicadorOpcao[]);
      const m: Record<string, string> = {};
      const nomes: Record<string, string> = {};
      for (const r of (mo.data ?? []) as any[]) {
        m[r.aplicador_id] = r.equipment_id;
        const eq = Array.isArray(r.equipments) ? r.equipments[0] : r.equipments;
        if (eq?.name) nomes[r.equipment_id] = eq.name;
      }
      setMontagens(m);
      setNomesEquip(nomes);
      setEquipFinalizeId(((ev as any)?.data?.equipment_id as string | null) ?? null);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMentoria]);
  const temAplicadores = !isMentoria && aplicadores.length > 0;
  const equipLocacaoId = mode.kind === "finalize" ? equipFinalizeId : linkedReservation?.equipment_id ?? equipmentId;
  const nomeEquipLocacao =
    (mode.kind === "create" ? equipmentsList.find((e) => e.id === equipLocacaoId)?.name : null) ||
    (equipLocacaoId ? nomesEquip[equipLocacaoId] : null) ||
    equipmentLabel ||
    "HIPRO";
  const montadaNoHipro = equipLocacaoId
    ? aplicadores.find((a) => montagens[a.id] === equipLocacaoId)?.id ?? ""
    : "";
  function nomeEquip(id: string): string {
    return nomesEquip[id] || equipmentsList.find((e) => e.id === id)?.name || "outro HIPRO";
  }
  function nomeAplicador(id: string): string {
    const a = aplicadores.find((x) => x.id === id);
    return a ? a.nome : "ponteira";
  }
  function aplicadorDaContagem(c: ContagemTela): string {
    if (!temAplicadores) return "";
    if (c.aplicadorId !== undefined) return c.aplicadorId;
    return c.padraoMontada ? montadaNoHipro : "";
  }
  // Sugestão: as que não estão montadas em nenhum HIPRO vêm primeiro.
  const aplicadoresOrdenados = useMemo(
    () => [...aplicadores].sort((a, b) => Number(!!montagens[a.id]) - Number(!!montagens[b.id])),
    [aplicadores, montagens]
  );
  const ultimaContagemTela = contagensTela[contagensTela.length - 1];
  const aplicadorUltima = ultimaContagemTela ? aplicadorDaContagem(ultimaContagemTela) : "";
  const trocaPonteira = temAplicadores && !!aplicadorUltima && aplicadorUltima !== montadaNoHipro;

  // ------------------------------------------------------------
  // Crédito de disparos da cliente (view creditos_saldo)
  // ------------------------------------------------------------
  const [saldoCredito, setSaldoCredito] = useState<{ disponiveis: number; aguardando: number } | null>(null);
  // Crédito nunca é usado sozinho: o dono liga e escolhe quanto abater.
  const [usarCredito, setUsarCredito] = useState(false);
  // null = usa o máximo possível; texto = quantidade que o dono digitou.
  const [creditoDigitado, setCreditoDigitado] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setSaldoCredito(null);
    setUsarCredito(false);
    setCreditoDigitado(null);
    if (isMentoria || !activeClientId) return;
    supabase
      .from("creditos_saldo")
      .select("disparos_disponiveis, disparos_aguardando, valor_disponivel")
      .eq("client_id", activeClientId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active || !data) return;
        const d = data as any;
        setSaldoCredito({
          disponiveis: Math.max(0, Number(d.disparos_disponiveis) || 0),
          aguardando: Math.max(0, Number(d.disparos_aguardando) || 0),
        });
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClientId, isMentoria]);
  const creditoDisponivel = saldoCredito?.disponiveis ?? 0;
  const creditoMaximo = creditoUsavel(totalDisparos, creditoDisponivel);
  const creditoUsado =
    isMentoria || !usarCredito || creditoDisponivel <= 0
      ? 0
      : creditoDigitado === null
      ? creditoMaximo
      : Math.min(creditoMaximo, Number(onlyDigits(creditoDigitado)) || 0);
  // Disparos que entram no valor (o total real continua indo para p_shots).
  const shots = disparosCobrados(totalDisparos, creditoUsado);
  // Tudo coberto pelo crédito: valor dos disparos é zero, mas dá para salvar.
  const tudoNoCredito = !isMentoria && todasContagensPreenchidas && totalDisparos > 0 && shots === 0;

  const pricing = useMemo(() => {
    if (isMentoria || !shots || shots <= 0) return null;
    try {
      return calculateRentalValue(shots, pricingConfig);
    } catch (e) {
      if (e instanceof RentalPricingError) return null;
      throw e;
    }
  }, [isMentoria, shots, pricingConfig]);

  // Linhas de pagamento (forma/valor/conta pix). Declarado antes do cálculo da
  // mentoria porque a forma da primeira linha decide à vista ou parcelado; do
  // contrário a mentoria travava ao abrir (usava a forma antes de existir).
  const [pagamentos, setPagamentos] = useState<PagamentoTela[]>([
    { id: newId("pag"), forma: "pix", valor: 0, valorTexto: "", pixConta: "harmonize", data: hojeLocal() },
  ]);
  const primeiraFormaPagamento = pagamentos[0]?.forma ?? "";

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
  }, [isMentoria, patientCountNumber, mentoriaPricingResolved, primeiraFormaPagamento]);

  // ------------------------------------------------------------
  // Custo por disparo negociado manualmente (não existe em mentoria)
  // ------------------------------------------------------------
  const [usarCustoManual, setUsarCustoManual] = useState(false);
  const [custoManualInput, setCustoManualInput] = useState(""); // "0,065" como escrito; só dígitos = centavos ("9" = R$0,09)
  const custoManualPorDisparo = usarCustoManual ? lerCustoPorDisparo(custoManualInput) : null;

  // ------------------------------------------------------------
  // Deslocamento
  // ------------------------------------------------------------
  const [kmIda, setKmIda] = useState("");
  const kmIdaNumber = Number(onlyDigits(kmIda)) || 0;
  const prefsDeslocamento = usePreferencias().deslocamento;
  const valorDeslocamentoPreview = calcularValorDeslocamento(kmIdaNumber, prefsDeslocamento);

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

  // Desconto em porcentagem incide só sobre o valor dos disparos (com o custo
  // negociado, se houver), nunca sobre aluguel, deslocamento ou taxa.
  const subtotalParaDesconto = valorDosDisparos({
    isMentoria,
    shots,
    pricing,
    mentoriaPricing: mentoriaCalc,
    custoManualPorDisparo,
  });
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
  // "Isentar taxa" na finalização: marca esta reserva como sem taxa e some o aviso.
  const [taxaIsentada, setTaxaIsentada] = useState(false);
  const [isentando, setIsentando] = useState(false);
  const feePending = mode.kind === "finalize" && mode.reservation.taxaStatus === "pendente" && !taxaIsentada;
  // Em modo "create", a taxa nasce pendente sozinha (gatilho do banco)
  // quando a data é futura e o cliente não é parceiro nem isento — mesma conta de
  // definir_taxa_ao_criar_evento. Só decide se a opção aparece na tela.
  const feeWouldApplyOnCreate =
    mode.kind === "create" && !activeClientParceiro && !activeClientIsenta && eventDate > hojeLocal();
  const [chargeFeeNow, setChargeFeeNow] = useState(false);
  async function isentarTaxaDestaReserva() {
    if (mode.kind !== "finalize") return;
    const ok = await confirmarApp({
      titulo: "Isentar a taxa desta reserva?",
      texto: "A cobrança some e esta locação segue sem taxa de reserva.",
      confirmar: "Isentar taxa",
    });
    if (!ok) return;
    setIsentando(true);
    const { error: erroIsentar } = await supabase.rpc("definir_taxa_agendamento", {
      p_event_id: mode.reservation.id,
      p_status: "nao_aplica",
      p_payment_method: "pix",
    });
    setIsentando(false);
    if (erroIsentar) {
      avisarApp(erroIsentar.message || "Não consegui isentar a taxa.", "erro");
      return;
    }
    setChargeFeeNow(false);
    setTaxaIsentada(true);
    avisarApp("Taxa isentada.");
  }

  const reservationFeeStatus: ReservationFeeStatus = feeIsPaid
    ? "ja_paga"
    : (feePending || feeWouldApplyOnCreate) && chargeFeeNow
    ? "cobrar_agora"
    : "nao_aplica";

  // Taxa já paga: o crédito é o valor que a cliente pagou (calendar_events.taxa_valor), não o
  // preço atual de Configurações, que pode ter mudado depois do pagamento.
  const [taxaPagaValor, setTaxaPagaValor] = useState<number | null>(null);
  const reservaIdFinalizar = mode.kind === "finalize" ? mode.reservation.id : null;
  useEffect(() => {
    let active = true;
    if (!feeIsPaid || !reservaIdFinalizar) return;
    supabase
      .from("calendar_events")
      .select("taxa_valor")
      .eq("id", reservaIdFinalizar)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data?.taxa_valor != null) setTaxaPagaValor(Number(data.taxa_valor));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeIsPaid, reservaIdFinalizar]);
  const feeDoResumo = reservationFeeStatus === "ja_paga" && taxaPagaValor != null ? taxaPagaValor : fee;

  // ------------------------------------------------------------
  // Pagamento: lista de linhas (forma/valor/conta pix). 0 = a receber,
  // 1 = integral, 2+ = parcial.
  // ------------------------------------------------------------

  function updatePagamento(id: string, patch: Partial<PagamentoTela>) {
    setPagamentos((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }
  function addPagamento() {
    setPagamentos((prev) => [...prev, { id: newId("pag"), forma: "pix", valor: 0, valorTexto: "", pixConta: "harmonize", data: hojeLocal() }]);
  }
  function removePagamento(id: string) {
    setPagamentos((prev) => prev.filter((p) => p.id !== id));
  }

  // ------------------------------------------------------------
  // Resumo/totais
  // ------------------------------------------------------------
  const resumo = useMemo(() => {
    if (isMentoria && !mentoriaCalc) return null;
    if (!isMentoria && !pricing && !tudoNoCredito) return null;
    return calcularResumoLocacao({
      isMentoria,
      shots,
      pricing,
      custoManualPorDisparo,
      mentoriaPricing: mentoriaCalc,
      kmIda: kmIdaNumber,
      deslocamentoCfg: prefsDeslocamento,
      itens,
      reservationFeeStatus,
      reservationFee: feeDoResumo,
    });
  }, [isMentoria, mentoriaCalc, pricing, tudoNoCredito, shots, custoManualPorDisparo, kmIdaNumber, prefsDeslocamento, itens, reservationFeeStatus, feeDoResumo]);

  // Deslocamento lançado na reserva: fica cobrado à parte na locação (soma no saldo a receber)
  // e pode ser recebido junto aqui. Digitar km acima troca pelo cálculo da calculadora.
  const [deslocReserva, setDeslocReserva] = useState(0);
  useEffect(() => {
    let active = true;
    if (!reservaIdFinalizar) return;
    supabase
      .from("calendar_events")
      .select("valor_deslocamento")
      .eq("id", reservaIdFinalizar)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setDeslocReserva(Number(data?.valor_deslocamento ?? 0));
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservaIdFinalizar]);
  const deslocReservaAParte = kmIdaNumber > 0 ? 0 : deslocReserva;
  const totalCobrar = resumo ? Math.round((resumo.totalAPagarAgora + deslocReservaAParte) * 100) / 100 : 0;

  function preencherValorTotal(id: string) {
    if (!resumo) return;
    updatePagamento(id, {
      valor: totalCobrar,
      valorTexto: totalCobrar > 0 ? String(totalCobrar).replace(".", ",") : "",
    });
  }

  const somaPagamentos = useMemo(() => Math.round(pagamentos.reduce((acc, p) => acc + (p.valor || 0), 0) * 100) / 100, [pagamentos]);
  const somaDinheiro = useMemo(
    () => Math.round(pagamentos.reduce((acc, p) => acc + (p.forma === "permuta" ? 0 : p.valor || 0), 0) * 100) / 100,
    [pagamentos]
  );
  const saldoAposPagamentos = resumo ? Math.round((totalCobrar - somaPagamentos) * 100) / 100 : 0;
  // Dinheiro (pix, cartão, espécie) acima do total: o banco recusaria as últimas linhas depois de
  // criar a locação (meio registrada). Permuta acima do total vira crédito e pode.
  const dinheiroExcedeTotal = !!resumo && somaDinheiro - totalCobrar > 0.009;
  // Permuta abate o que sobra depois do dinheiro; o que passar vira crédito em R$.
  const divisaoPermuta = useMemo(() => {
    const mapa: Record<string, { abate: number; credito: number }> = {};
    let restante = resumo ? Math.max(0, Math.round((totalCobrar - somaDinheiro) * 100) / 100) : 0;
    let creditoTotal = 0;
    for (const p of pagamentos) {
      if (p.forma !== "permuta" || !(p.valor > 0)) continue;
      const abate = Math.min(restante, p.valor);
      restante = Math.round((restante - abate) * 100) / 100;
      const credito = Math.round((p.valor - abate) * 100) / 100;
      creditoTotal += credito;
      mapa[p.id] = { abate, credito };
    }
    return { mapa, creditoTotal: Math.round(creditoTotal * 100) / 100 };
  }, [pagamentos, resumo, somaDinheiro]);
  const temPermutaPessoal = pagamentos.some((p) => p.forma === "permuta" && p.permutaDestino === "pessoal");
  const [categoriasPessoais, setCategoriasPessoais] = useState<CategoryOption[] | null>(null);
  useEffect(() => {
    if (!temPermutaPessoal || categoriasPessoais !== null) return;
    supabase
      .from("categories")
      .select("id, name")
      .eq("type", "saida")
      .eq("scope", "pessoal")
      .order("name")
      .then(({ data }) => setCategoriasPessoais(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temPermutaPessoal]);

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
        reservationFee: feeDoResumo,
        initialCount: initialNumber,
        finalCount: finalNumber,
        patientCount: patientCountNumber,
        clientName: activeClientName,
        eventDate,
        pagamentos,
        contagens: contagensParaSalvar,
        disparosRealizados: totalDisparos,
        creditoUsado,
        viraCredito: disparosViraCredito,
      },
      resumo
    );
  }, [
    contagensParaSalvar,
    totalDisparos,
    creditoUsado,
    disparosViraCredito,
    resumo,
    isMentoria,
    shots,
    pricing,
    custoManualPorDisparo,
    mentoriaCalc,
    kmIdaNumber,
    itens,
    reservationFeeStatus,
    feeDoResumo,
    initialNumber,
    finalNumber,
    patientCountNumber,
    activeClientName,
    eventDate,
    pagamentos,
  ]);
  const previewWhatsappLink = previewWhatsappText ? buildWhatsAppLink(activeClientWhatsapp, previewWhatsappText) : null;

  // Dados da imagem do cálculo (disparos, com contagem, ou mentoria, com pacientes modelo).
  const dadosImagem = useMemo(() => {
    if (isMentoria) {
      if (!mentoriaCalc || !resumo) return null;
      return montarDadosMentoria({
        cliente: activeClientName || null,
        dataEvento: eventDate || null,
        mentoria: mentoriaCalc,
        itens,
        descontoPercentual: descontoTipo === "percentual" ? descontoRawNumero : null,
        kmIda: kmIdaNumber,
        resumo,
      });
    }
    // Tudo no crédito: sai a imagem com o valor dos disparos zerado.
    if (!resumo) return null;
    if (!tudoNoCredito && (!pricing || shots <= 0)) return null;
    return montarDadosCalculo({
      cliente: activeClientName || null,
      dataEvento: eventDate || null,
      contagemInicial: initialNumber,
      contagemFinal: finalNumber,
      disparos: shots,
      pricing: tudoNoCredito ? null : pricing,
      custoManualPorDisparo,
      itens,
      descontoPercentual: descontoTipo === "percentual" ? descontoRawNumero : null,
      kmIda: kmIdaNumber,
      resumo,
      contagens: contagensCalc
        .filter((c) => c.preenchida)
        .map((c) => ({ inicial: c.inicialN, final: c.finalN, disparos: c.disparos, viraCredito: c.geraCredito })),
      disparosRealizados: totalDisparos,
      creditoUsado,
    });
  }, [
    isMentoria,
    mentoriaCalc,
    pricing,
    tudoNoCredito,
    contagensCalc,
    totalDisparos,
    creditoUsado,
    resumo,
    shots,
    activeClientName,
    eventDate,
    initialNumber,
    finalNumber,
    custoManualPorDisparo,
    itens,
    descontoTipo,
    descontoRawNumero,
    kmIdaNumber,
  ]);
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
    if (mode.kind === "create" && isPeriodo && (!eventDateEnd || eventDateEnd < eventDate)) {
      setError("Informe uma data final válida (igual ou depois da data inicial).");
      return;
    }
    if (isMentoria) {
      if (!patientCount || patientCountNumber <= 0) {
        setError("Informe a quantidade de pacientes modelo.");
        return;
      }
    } else {
      const incompleta = contagensCalc.findIndex((c) => !c.preenchida);
      if (incompleta >= 0) {
        setError(
          contagensCalc.length > 1
            ? `Preencha o valor inicial e o final da contagem ${incompleta + 1} (ou tire essa contagem).`
            : "Preencha a contagem inicial e final do equipamento."
        );
        return;
      }
      const iguais = contagensCalc.findIndex((c) => c.inicialN === c.finalN);
      if (iguais >= 0) {
        setError(
          contagensCalc.length > 1
            ? `Na contagem ${iguais + 1} as duas leituras são iguais: não há disparos. Corrija ou tire essa contagem.`
            : "As duas contagens são iguais: não há disparos para cobrar."
        );
        return;
      }
      if (creditoUsado > creditoDisponivel) {
        setError("O crédito usado passa do que a cliente tem disponível.");
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
      if (p.valor > 0 && p.forma === "permuta") {
        if (!p.permutaDescricao?.trim()) {
          setError("Na permuta, escreva o que veio (produto ou serviço).");
          return;
        }
        if (p.permutaDestino === "pessoal" && !p.permutaCategoria) {
          setError("Na permuta pessoal, escolha a categoria do gasto.");
          return;
        }
      }
    }

    if (dinheiroExcedeTotal) {
      setError("Os pagamentos passam do total. Ajuste os valores antes de salvar.");
      return;
    }

    setSaving(true);
    setError(null);
    setWarning(null);

    // Forma registrada na locação: o primeiro pagamento em dinheiro; só permuta, fica permuta.
    const primeiraForma =
      (pagamentos.find((p) => p.valor > 0 && p.forma !== "permuta")?.forma as any) ??
      (pagamentos.find((p) => p.valor > 0)?.forma as any) ??
      "pix";
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
        // Total real de disparos (desgaste dos aplicadores); o valor já vem com o crédito descontado.
        p_shots: totalDisparos,
        p_calculated_value: resumo.valorBruto,
        p_payment_method: primeiraForma,
        p_notes: notes || null,
        p_pix_conta: primeiraPixConta,
        p_pago: false,
      });
      if (rpcError) {
        setSaving(false);
        setError(rpcError.message || "Não foi possível finalizar a reserva vinculada. Tente novamente.");
        return;
      }
      rentalId = data as string;
    } else if (mode.kind === "create") {
      const { data, error: rpcError } = await supabase.rpc("create_rental", {
        p_client_id: activeClientId,
        p_equipment_id: equipmentId,
        p_event_date: eventDate,
        p_shots: totalDisparos,
        p_calculated_value: resumo.valorBruto,
        p_payment_method: primeiraForma,
        p_notes: notes || null,
        p_pago: false,
        p_pix_conta: primeiraPixConta,
        p_event_date_end: isPeriodo ? eventDateEnd : null,
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
          setError(rpcError.message || "Não foi possível salvar a locação. Tente novamente.");
        }
        return;
      }
      rentalId = data as string;
    } else {
      const { data, error: rpcError } = await supabase.rpc("finalize_rental_reservation", {
        p_calendar_event_id: mode.reservation.id,
        p_shots: isMentoria ? patientCountNumber : totalDisparos,
        p_calculated_value: resumo.valorBruto,
        p_payment_method: primeiraForma,
        p_notes: notes || null,
        p_pix_conta: primeiraPixConta,
        p_pago: false,
      });
      if (rpcError) {
        setSaving(false);
        setError(rpcError.message || "Não foi possível finalizar a reserva. Tente novamente.");
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

    if (!isMentoria) {
      const { error: eCont } = await supabase.rpc("registrar_contagens_locacao", {
        p_rental_id: rentalId,
        p_contagens: contagensCalc
          .filter((c) => c.preenchida)
          .map((c) => {
            const aplicadorId = aplicadorDaContagem(c);
            return {
              inicial: c.inicialN,
              final: c.finalN,
              gera_credito: !!c.geraCredito,
              ...(aplicadorId ? { aplicador_id: aplicadorId } : {}),
            };
          }),
        p_credito_usado: creditoUsado,
      });
      if (eCont) {
        avisos.push(
          `as contagens${creditoUsado > 0 || disparosViraCredito > 0 ? " e o crédito de disparos" : ""} não foram registradas (${eCont.message || "erro no banco"})`
        );
      }

      // A última contagem usou outra ponteira: ela fica montada no HIPRO a partir da data da locação.
      if (trocaPonteira && registrarTroca) {
        if (!equipLocacaoId) {
          avisos.push(`a troca de ponteira não foi registrada (não achei o equipamento da locação; registre em Equipamentos)`);
        } else {
          const { error: eTroca } = await supabase.rpc("montar_aplicador", {
            p_aplicador_id: aplicadorUltima,
            p_equipment_id: equipLocacaoId,
            p_desde: eventDate,
          });
          if (eTroca) {
            avisos.push(`a troca de ponteira não foi registrada (${eTroca.message || "erro no banco"}; registre em Equipamentos)`);
          }
        }
      }
    }

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
        // Leva AC: já está somado em calculated_value; não gerar lançamento próprio.
        p_incluso_no_valor: true,
      });
      if (e2) avisos.push("o deslocamento não foi salvo automaticamente");
    }

    let taxaRegistrada = false;
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
          // A taxa entra no caixa no dia em que o dinheiro entrou (a data do
          // primeiro pagamento informado), não na data do evento.
          p_data: pagamentos.find((p) => p.valor > 0)?.data || hojeLocal(),
        });
        if (e3) avisos.push("a taxa de reserva não foi registrada automaticamente (marque como paga na ficha do cliente)");
        else taxaRegistrada = true;
      } else {
        avisos.push("não encontrei o agendamento para registrar a taxa automaticamente");
      }
    }

    // Com a taxa cobrada agora, ela já virou lançamento próprio e crédito da
    // locação: dos valores recebidos, só o que passa dela é pagamento da locação.
    // Permuta não é dinheiro: não paga a taxa e é lançada depois dos outros pagamentos.
    const pagamentosDinheiro = pagamentos.filter((p) => p.forma !== "permuta");
    const pagamentosPermuta = pagamentos.filter((p) => p.forma === "permuta" && p.valor > 0);
    let pagamentosDaLocacao = pagamentosDinheiro;
    if (taxaRegistrada) {
      const { linhas, taxaNaoCoberta } = descontarTaxaDosPagamentos(pagamentosDinheiro, fee);
      pagamentosDaLocacao = linhas;
      if (taxaNaoCoberta > 0) {
        avisos.push(
          `o valor recebido (${formatCurrency(somaDinheiro)}) é menor que a taxa de reserva (${formatCurrency(fee)}), então nada foi lançado como pagamento da locação`
        );
      }
    }

    for (const p of pagamentosDaLocacao) {
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

    // Permuta: sai do caixa como Outros (empresa) ou Retirada (pessoal), abate a
    // locação e o que passar fica de crédito em R$ para a cliente.
    for (const p of pagamentosPermuta) {
      const destino = p.permutaDestino === "pessoal" ? "pessoal" : "empresa";
      const { error: ePerm } = await supabase.rpc("registrar_permuta", {
        p_client_id: activeClientId,
        p_valor: p.valor,
        p_descricao: (p.permutaDescricao ?? "").trim(),
        p_destino: destino,
        p_categoria_pessoal: destino === "pessoal" ? p.permutaCategoria || null : null,
        p_rental_id: rentalId,
        p_data: p.data || eventDate,
      });
      if (ePerm) avisos.push(`a permuta (${formatCurrency(p.valor)}) não foi registrada (${ePerm.message || "erro no banco"})`);
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
          reservationFee: feeDoResumo,
          initialCount: initialNumber,
          finalCount: finalNumber,
          patientCount: patientCountNumber,
          clientName: activeClientName,
          eventDate,
          pagamentos,
          contagens: contagensParaSalvar,
          disparosRealizados: totalDisparos,
          creditoUsado,
          viraCredito: disparosViraCredito,
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
        <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl">
          <h2 className="mb-1 text-lg font-semibold text-neutral-900">
            {mode.kind === "create" ? "Locação salva ✅" : isMentoria ? "Mentoria finalizada ✅" : "Locação finalizada ✅"}
          </h2>
          <p className="mb-2 text-sm text-neutral-500">Copie o resumo abaixo ou envie direto no WhatsApp.</p>
          {warning && <p className="mb-3 text-xs text-amber-600">{warning}</p>}

          <pre className="whitespace-pre-wrap rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700">
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
            <CalculoImagemBotao dados={dadosImagem} whatsapp={activeClientWhatsapp} />
          </div>

          {/* Despesa da locação (leva O): ligada a ESTA locação */}
          <div className="mt-5 rounded-xl border border-neutral-200 p-3">
            <p className="mb-2 text-sm font-medium text-neutral-700">
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
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={despForma}
                    onChange={(e) => setDespForma(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                {despErro && <p className="text-xs text-red-600">{despErro}</p>}
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
  const disparosValidos = !isMentoria && todasContagensPreenchidas && totalDisparos > 0 && (!!pricing || tudoNoCredito);
  const podeSalvar = (isMentoria ? !!mentoriaCalc : disparosValidos) && !dinheiroExcedeTotal;

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">
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
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            <p className="font-medium">
              ⚠️ {activeClientName} já tem {pendingReservations.length > 1 ? "pré-reservas pendentes" : "uma pré-reserva pendente"}. Antes de continuar, confira se não é a mesma reserva:
            </p>
            <ul className="mt-2 space-y-2">
              {pendingReservations.map((r) => (
                <li key={r.id} className="rounded-lg border border-amber-200 bg-white/60 p-2">
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

        {outroEquipAviso && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            {outroEquipAviso}
          </div>
        )}

        {feeIsPaid && (
          <div className="mb-4 rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3 text-xs text-brand-teal">
            💳 A taxa de reserva desta data ({formatCurrency(feeDoResumo)}) já foi paga. Ela entra como crédito no total abaixo.
          </div>
        )}
        {feePending && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
            💳 A taxa de reserva desta data está pendente. Marque "Cobrar taxa de reserva agora" mais abaixo se for cobrar junto.
            <button
              type="button"
              disabled={isentando}
              onClick={isentarTaxaDestaReserva}
              className="mt-2 block rounded-lg border border-amber-400 bg-white px-3 py-2.5 text-sm font-semibold text-amber-800 disabled:opacity-60"
            >
              {isentando ? "Salvando..." : "Isentar taxa desta reserva"}
            </button>
          </div>
        )}

        <div className="space-y-4">
          {mode.kind === "create" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">Equipamento</label>
                <select
                  value={equipmentId}
                  onChange={(e) => setEquipmentId(e.target.value)}
                  disabled={!!linkedReservationId}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60"
                >
                  {equipmentsList.map((eq) => (
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
                  disabled={!!linkedReservationId}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-60"
                />
              </div>
              {linkedReservationId && (
                <p className="col-span-2 -mt-1 text-[11px] text-neutral-400">
                  Equipamento e data vieram da pré-reserva vinculada. Clique em "desvincular" acima para escolher outros.
                </p>
              )}
              {!linkedReservationId && (
                <div className="col-span-2">
                  <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                    <input
                      type="checkbox"
                      checked={isPeriodo}
                      onChange={(e) => {
                        setIsPeriodo(e.target.checked);
                        if (!e.target.checked) setEventDateEnd("");
                      }}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                    Locação de período (mais de um dia)
                  </label>
                  {isPeriodo && (
                    <div className="mt-2">
                      <label className="mb-1 block text-xs font-medium text-neutral-600">Até</label>
                      <input
                        type="date"
                        value={eventDateEnd}
                        min={eventDate}
                        onChange={(e) => setEventDateEnd(e.target.value)}
                        className="w-full max-w-[200px] rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                      />
                      <p className="mt-1 text-[11px] text-neutral-400">
                        O equipamento fica bloqueado na Agenda em todos os dias do período, igual a uma reserva de um dia só.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---- Contagem do equipamento / pacientes modelo ---- */}
          <div className="rounded-2xl bg-white/60 p-4 shadow-sm">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {isMentoria ? "Pacientes modelo" : "Contagem do equipamento"}
            </p>

            {isMentoria ? (
              <div>
                <input
                  inputMode="numeric"
                  value={patientCount}
                  onChange={(e) => setPatientCount(onlyDigits(e.target.value))}
                  placeholder="Ex: 1"
                  className="w-full max-w-[140px] rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                <p className="mt-1 text-xs text-neutral-400">Normalmente 1 (individual); já aconteceu até 3 na mesma mentoria.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {contagensCalc.map((c, idx) => {
                  const ultima = idx === contagensCalc.length - 1;
                  const salva = ultima
                    ? (mode.kind === "finalize" ? inicialAtualDaReserva : linkedReservation ? inicialAtualDaReserva ?? linkedReservation.contagemInicial : null)
                    : null;
                  return (
                    <div key={c.id} className={contagensCalc.length > 1 ? "rounded-xl border border-neutral-200 p-3" : ""}>
                      {contagensCalc.length > 1 && (
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-medium text-neutral-500">
                            Contagem {idx + 1}
                            {c.preenchida && ` · ${c.disparos.toLocaleString("pt-BR")} disparos`}
                          </span>
                          {idx > 0 && (
                            <button
                              type="button"
                              onClick={() => removeContagem(c.id)}
                              aria-label={`Tirar contagem ${idx + 1}`}
                              className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-brand-teal">Valor inicial</label>
                          <input
                            inputMode="numeric"
                            value={c.inicial}
                            onChange={(e) => updateContagem(c.id, { inicial: e.target.value })}
                            placeholder="0"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          />
                        </div>
                        <span className="pb-2 text-neutral-400">→</span>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-brand-pink">Valor final</label>
                          <input
                            inputMode="numeric"
                            value={c.final}
                            onChange={(e) => updateContagem(c.id, { final: e.target.value })}
                            placeholder="0"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          />
                        </div>
                      </div>
                      {temAplicadores && (
                        <div className="mt-2">
                          <label className="mb-1 block text-xs font-medium text-neutral-600">Ponteira</label>
                          <select
                            value={aplicadorDaContagem(c)}
                            onChange={(e) => updateContagem(c.id, { aplicadorId: e.target.value })}
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          >
                            <option value="">Escolha a ponteira...</option>
                            {aplicadoresOrdenados.map((a) => {
                              const ondeEsta = montagens[a.id];
                              const sufixo = !ondeEsta
                                ? " (de reserva)"
                                : ondeEsta === equipLocacaoId
                                ? ` (montada no ${nomeEquipLocacao})`
                                : ` (montada no ${nomeEquip(ondeEsta)})`;
                              return (
                                <option key={a.id} value={a.id}>
                                  {a.nome}
                                  {a.numero_serie ? ` · ${a.numero_serie}` : ""}
                                  {sufixo}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      )}
                      {salva != null && c.inicial === String(salva) && !c.final && (
                        <p className="mt-2 rounded-lg bg-brand-teal/10 px-3 py-2 text-xs text-brand-teal">
                          {contagensCalc.length > 1 ? "Contagem inicial da ponteira atual" : "Contagem inicial"} guardada na reserva ({salva.toLocaleString("pt-BR")}). Falta só digitar a final.
                        </p>
                      )}
                      {c.invertidas && (
                        <p className="mt-2 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-700">
                          As leituras estavam invertidas. Para o cálculo, a menor ({c.inicialN.toLocaleString("pt-BR")}) vale
                          como inicial e a maior ({c.finalN.toLocaleString("pt-BR")}) como final: {c.disparos.toLocaleString("pt-BR")}{" "}
                          disparos.
                        </p>
                      )}
                      {c.geraCredito && (
                        <div className="mt-2 rounded-lg bg-brand-lilac/10 px-3 py-2 text-xs text-brand-lilac">
                          <p className="font-medium">
                            Vira crédito: {c.disparos.toLocaleString("pt-BR")} disparos (vale depois que a locação for paga)
                          </p>
                          <p className="mt-0.5 text-neutral-500">A cliente paga esta contagem hoje e usa os disparos na próxima locação.</p>
                          <label className="mt-1.5 flex items-center gap-2 text-neutral-600">
                            <input
                              type="checkbox"
                              checked={c.geraCredito}
                              onChange={(e) => updateContagem(c.id, { geraCredito: e.target.checked })}
                              className="h-4 w-4 rounded border-neutral-300"
                            />
                            vira crédito
                          </label>
                        </div>
                      )}
                      {ultima && c.preenchida && c.disparos > 0 && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => addContagem(false)}
                            className="rounded-lg border border-brand-teal py-2 text-xs font-medium text-brand-teal"
                          >
                            + Somar outra contagem
                          </button>
                          <button
                            type="button"
                            onClick={() => addContagem(true)}
                            className="rounded-lg border border-brand-lilac py-2 text-xs font-medium text-brand-lilac"
                          >
                            Gerar crédito e continuar
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {contagensCalc.length > 1 && (
                  <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                    <span>Soma das contagens</span>
                    <span className="font-semibold">{totalDisparos.toLocaleString("pt-BR")} disparos</span>
                  </div>
                )}

                {trocaPonteira && (
                  <label className="flex items-start gap-2 rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3 text-xs text-neutral-700">
                    <input
                      type="checkbox"
                      checked={registrarTroca}
                      onChange={(e) => setRegistrarTroca(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300"
                    />
                    <span>
                      Registrar a troca: <strong>{nomeAplicador(aplicadorUltima)}</strong> fica montada no{" "}
                      <strong>{nomeEquipLocacao}</strong> a partir de {formatDate(eventDate)}
                    </span>
                  </label>
                )}

                {creditoDisponivel > 0 && (
                  <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-brand-teal">
                        Crédito de disparos: {creditoDisponivel.toLocaleString("pt-BR")} disponíveis
                      </span>
                      <label className="flex items-center gap-2 text-neutral-600">
                        <input
                          type="checkbox"
                          checked={usarCredito}
                          onChange={(e) => setUsarCredito(e.target.checked)}
                          className="h-4 w-4 rounded border-neutral-300"
                        />
                        Usar crédito
                      </label>
                    </div>
                    {!usarCredito && (
                      <p className="mt-1 text-neutral-500">Não abate nada sozinho. Ligue &quot;Usar crédito&quot; para escolher quanto abater.</p>
                    )}
                    {usarCredito && (
                      <div className="mt-2">
                        <label className="mb-1 block text-neutral-500">
                          Disparos do crédito usados nesta locação (máximo {creditoMaximo.toLocaleString("pt-BR")})
                        </label>
                        <input
                          inputMode="numeric"
                          value={creditoDigitado ?? String(creditoMaximo)}
                          onChange={(e) => {
                            const digitos = onlyDigits(e.target.value);
                            if (digitos && Number(digitos) > creditoMaximo) setCreditoDigitado(String(creditoMaximo));
                            else setCreditoDigitado(digitos);
                          }}
                          onBlur={() => {
                            if (creditoDigitado !== null && !creditoDigitado) setCreditoDigitado("0");
                          }}
                          className="w-full max-w-[160px] rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        />
                        {creditoDigitado !== null && Number(creditoDigitado || 0) !== creditoMaximo && (
                          <button
                            type="button"
                            onClick={() => setCreditoDigitado(null)}
                            className="ml-2 text-brand-teal underline underline-offset-2"
                          >
                            usar o máximo
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {(saldoCredito?.aguardando ?? 0) > 0 && (
                  <p className="text-xs text-neutral-500">
                    {(saldoCredito?.aguardando ?? 0).toLocaleString("pt-BR")} disparos aguardando o pagamento da locação de origem.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ---- Resumo do cálculo ---- */}
          {(pricing || mentoriaCalc || tudoNoCredito) && (
            <div className="rounded-2xl bg-white/60 p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Resumo do cálculo</p>

              {isMentoria && mentoriaCalc ? (
                <div className="rounded-xl bg-brand-lilac/10 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-neutral-600">Valor da mentoria</span>
                    <span className="font-semibold text-brand-lilac">{formatCurrency(mentoriaCalc.totalValue)}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    {mentoriaCalc.patientCount} paciente(s) x {formatCurrency(mentoriaCalc.unitValue)}
                    {mentoriaCalc.isParcelado ? " (parcelado no crédito até 10x)" : " (à vista)"}
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-3 space-y-1 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-neutral-500">Disparos realizados</span>
                      <span className="font-semibold text-neutral-700">{totalDisparos.toLocaleString("pt-BR")}</span>
                    </div>
                    {creditoUsado > 0 && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-neutral-500">Crédito usado</span>
                          <span className="font-semibold text-brand-teal">−{creditoUsado.toLocaleString("pt-BR")}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-neutral-200 pt-1">
                          <span className="text-neutral-600">Disparos cobrados</span>
                          <span className="font-semibold text-neutral-800">{shots.toLocaleString("pt-BR")}</span>
                        </div>
                      </>
                    )}
                    {disparosViraCredito > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-neutral-500">Vira crédito para a próxima</span>
                        <span className="font-medium text-brand-lilac">{disparosViraCredito.toLocaleString("pt-BR")} disparos</span>
                      </div>
                    )}
                  </div>
                  {tudoNoCredito && !pricing && (
                    <div className="rounded-xl bg-brand-teal/10 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600">Valor dos disparos</span>
                        <span className="font-semibold text-brand-teal">{formatCurrency(0)}</span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">Todos os disparos foram cobertos pelo crédito da cliente.</p>
                    </div>
                  )}
                {pricing && (
                  <>
                    <div className="rounded-xl bg-brand-teal/10 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-600">Valor dos disparos (tabela)</span>
                        <span className="font-semibold text-brand-teal">{formatCurrency(pricing.totalValue)}</span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {pricing.tier3Portion > 0
                          ? `Acima de ${pricing.config.tier2Limit.toLocaleString("pt-BR")}: ${pricing.tier3Portion.toLocaleString("pt-BR")} disparos x R$ ${pricing.config.tier3Rate.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} (sobre o total)`
                          : `Pacote fixo até ${pricing.config.flatPackageLimit.toLocaleString("pt-BR")}: ${formatCurrency(pricing.flatPackageValue)}`}
                        {pricing.tier2Portion > 0 && ` · +${pricing.tier2Portion.toLocaleString("pt-BR")} a R$${pricing.config.tier2Rate.toFixed(2)}`}
                      </p>
                    </div>

                    {/* Custo por disparo negociado manualmente */}
                    <div className="mt-3">
                      <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
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
                            inputMode="decimal"
                            value={custoManualInput}
                            onChange={(e) => setCustoManualInput(limparCampoCustoPorDisparo(e.target.value))}
                            placeholder="Ex: 0,065"
                            className="w-full max-w-[180px] rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          />
                          {custoManualPorDisparo != null && resumo && (
                            <div className="mt-2 space-y-1 rounded-lg border border-dashed border-brand-teal/30 bg-brand-teal/5 p-2.5 text-xs">
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Custo negociado</span>
                                <span className="font-medium">R$ {custoManualPorDisparo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} / disparo</span>
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
                )}
                </>
              )}

              {/* Deslocamento */}
              <div className="mt-3">
                <label className="mb-1 block text-xs font-medium text-neutral-600">Deslocamento — km de ida</label>
                <div className="flex items-center gap-2">
                  <input
                    inputMode="numeric"
                    value={kmIda}
                    onChange={(e) => setKmIda(onlyDigits(e.target.value))}
                    placeholder="0"
                    className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
            <div className="rounded-2xl bg-white/60 p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Ajustes finais</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-amber-600">+ Aluguel</label>
                  <input
                    inputMode="decimal"
                    value={aluguelValor}
                    onChange={(e) => setAluguelValor(e.target.value)}
                    placeholder="R$ 0,00"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-medium text-brand-pink">- Desconto</label>
                    <div className="flex rounded-lg border border-neutral-300 p-0.5">
                      <button
                        type="button"
                        onClick={() => setDescontoTipo("valor")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${descontoTipo === "valor" ? "bg-brand-teal text-white" : "text-neutral-500"}`}
                      >
                        R$
                      </button>
                      <button
                        type="button"
                        onClick={() => setDescontoTipo("percentual")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition ${descontoTipo === "percentual" ? "bg-brand-teal text-white" : "text-neutral-500"}`}
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
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* Itens personalizados */}
              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-neutral-600">Itens personalizados</p>
                <div className="space-y-2">
                  <input
                    value={novoItemDesc}
                    onChange={(e) => setNovoItemDesc(e.target.value)}
                    placeholder="Descrição (ex: Insumo extra)"
                    maxLength={40}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <input
                      inputMode="decimal"
                      value={novoItemValor}
                      onChange={(e) => setNovoItemValor(e.target.value)}
                      placeholder="R$ 0,00"
                      className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                    />
                    <div className="flex rounded-lg border border-neutral-300 p-0.5">
                      <button
                        type="button"
                        onClick={() => setNovoItemTipo("mais")}
                        className={`rounded px-2.5 py-1 text-sm font-medium transition ${novoItemTipo === "mais" ? "bg-brand-teal text-white" : "text-neutral-500"}`}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setNovoItemTipo("menos")}
                        className={`rounded px-2.5 py-1 text-sm font-medium transition ${novoItemTipo === "menos" ? "bg-brand-pink text-white" : "text-neutral-500"}`}
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
                      <li key={it.id} className="flex items-center justify-between text-xs text-neutral-600">
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
                  <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                    <input type="checkbox" checked={chargeFeeNow} onChange={(e) => setChargeFeeNow(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
                    Cobrar taxa de reserva agora ({formatCurrency(fee)})
                  </label>
                </div>
              )}

              <div className="mt-4 rounded-xl bg-neutral-900 p-3 text-sm text-white">
                <div className="flex items-center justify-between">
                  <span>Total a cobrar do cliente</span>
                  <span className="text-lg font-semibold">{formatCurrency(totalCobrar)}</span>
                </div>
                {deslocReservaAParte > 0 && (
                  <p className="mt-1 text-xs text-white/70">
                    Inclui {formatCurrency(deslocReservaAParte)} de deslocamento lançado na reserva (entra no caixa quando for pago).
                  </p>
                )}
                {kmIdaNumber > 0 && deslocReserva > 0 && (
                  <p className="mt-1 text-xs text-white/70">
                    O deslocamento da reserva ({formatCurrency(deslocReserva)}) foi trocado pelo calculado aqui.
                  </p>
                )}
              </div>

              {previewWhatsappText && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-neutral-500">Envie os cálculos para o cliente conferir antes de registrar o pagamento.</p>
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
                      className="flex-1 rounded-xl border border-neutral-300 py-2 text-sm font-medium text-neutral-600"
                    >
                      {previewCopied ? "Copiado!" : "Copiar texto"}
                    </button>
                  </div>
                  <CalculoImagemBotao dados={dadosImagem} whatsapp={activeClientWhatsapp} />
                </div>
              )}
            </div>
          )}

          {/* ---- Pagamento ---- */}
          {resumo && (
            <div className="rounded-2xl bg-white/60 p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-neutral-500">Pagamento</p>

              {pagamentos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-500">
                  Esta locação fica em aberto — nada será registrado como pago agora.
                  <button type="button" onClick={addPagamento} className="mt-2 block w-full rounded-lg border border-brand-teal py-2.5 text-sm font-medium text-brand-teal">
                    + Adicionar um pagamento
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {pagamentos.map((p, idx) => (
                    <div key={p.id} className="rounded-xl border border-neutral-200 p-3">
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
                          onChange={(e) =>
                            updatePagamento(p.id, {
                              forma: e.target.value,
                              pixConta: e.target.value === "pix" ? p.pixConta || "harmonize" : "",
                              ...(e.target.value === "permuta" && !p.permutaDestino ? { permutaDestino: "empresa" as const } : {}),
                            })
                          }
                          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        >
                          {FORMAS_PAGAMENTO_LOCACAO.map((pm) => (
                            <option key={pm.value} value={pm.value}>
                              {pm.label}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-1">
                          <input
                            inputMode="decimal"
                            value={p.valorTexto}
                            onChange={(e) => {
                              const texto = e.target.value;
                              updatePagamento(p.id, { valorTexto: texto, valor: parseDecimal(texto) });
                            }}
                            placeholder="R$ 0,00"
                            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                          />
                          <button
                            type="button"
                            title="Preencher com o total"
                            onClick={() => preencherValorTotal(p.id)}
                            className="rounded-lg border border-neutral-300 px-2 text-xs text-neutral-500"
                          >
                            tot.
                          </button>
                        </div>
                      </div>
                      {p.forma === "pix" && (
                        <select
                          value={p.pixConta}
                          onChange={(e) => updatePagamento(p.id, { pixConta: e.target.value as PixContaValue })}
                          className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                        >
                          <option value="">Conta PIX que recebeu...</option>
                          {PIX_CONTAS.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      )}
                      {p.forma === "permuta" && (
                        <div className="mt-2 space-y-2 rounded-lg bg-brand-lilac/5 p-2.5">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-neutral-600">O que veio</label>
                            <input
                              value={p.permutaDescricao ?? ""}
                              onChange={(e) => updatePagamento(p.id, { permutaDescricao: e.target.value })}
                              placeholder="Ex: 10 frascos de enzima, ensaio de fotos"
                              maxLength={120}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            />
                          </div>
                          <div className="flex rounded-lg border border-neutral-300 p-0.5">
                            {(["empresa", "pessoal"] as const).map((d) => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => updatePagamento(p.id, { permutaDestino: d })}
                                className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition ${
                                  (p.permutaDestino ?? "empresa") === d ? "bg-brand-teal text-white" : "text-neutral-500"
                                }`}
                              >
                                {d === "empresa" ? "Da empresa" : "Pessoal"}
                              </button>
                            ))}
                          </div>
                          {p.permutaDestino === "pessoal" && (
                            <select
                              value={p.permutaCategoria ?? ""}
                              onChange={(e) => updatePagamento(p.id, { permutaCategoria: e.target.value })}
                              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                            >
                              <option value="">{categoriasPessoais === null ? "Carregando categorias..." : "Categoria do gasto pessoal..."}</option>
                              {(categoriasPessoais ?? []).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          )}
                          <p className="text-[11px] text-neutral-500">
                            Não entra dinheiro no caixa. Empresa: sai em Outros. Pessoal: sai como Retirada e vira gasto no Pessoal.
                          </p>
                          {(divisaoPermuta.mapa[p.id]?.credito ?? 0) > 0 && (
                            <p className="text-[11px] font-medium text-brand-lilac">
                              {formatCurrency(divisaoPermuta.mapa[p.id].abate)} abate e {formatCurrency(divisaoPermuta.mapa[p.id].credito)} fica de
                              crédito
                            </p>
                          )}
                        </div>
                      )}
                      <div className="mt-2">
                        <label className="mb-1 block text-[11px] font-medium text-neutral-500">
                          Data em que caiu/recebeu (não precisa ser o dia do HIPRO)
                        </label>
                        <input
                          type="date"
                          value={p.data}
                          onChange={(e) => updatePagamento(p.id, { data: e.target.value })}
                          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
                      className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs font-medium text-neutral-500"
                    >
                      Deixar em aberto
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Soma dos pagamentos: {formatCurrency(somaPagamentos)}</span>
                    {saldoAposPagamentos > 0.009 && <span className="font-medium text-amber-600">Saldo em aberto: {formatCurrency(saldoAposPagamentos)}</span>}
                    {saldoAposPagamentos < -0.009 &&
                      (divisaoPermuta.creditoTotal > 0.009 && Math.abs(-saldoAposPagamentos - divisaoPermuta.creditoTotal) < 0.01 ? (
                        <span className="font-medium text-brand-lilac">{formatCurrency(divisaoPermuta.creditoTotal)} fica de crédito</span>
                      ) : (
                        <span className="font-medium text-red-500">Excedeu o total em {formatCurrency(-saldoAposPagamentos)}</span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
        {dinheiroExcedeTotal && !error && resumo && (
          <p className="mt-3 text-sm text-red-600">
            Os pagamentos passam do total em {formatCurrency(Math.round((somaDinheiro - totalCobrar) * 100) / 100)}. Ajuste os valores para salvar.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600">
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
