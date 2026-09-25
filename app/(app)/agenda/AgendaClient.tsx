"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink, formatDate } from "@/lib/format";
import { buildPedidoConfirmacaoMessage } from "@/lib/confirmacao";
import { exportarCsv } from "@/lib/exportar-csv";
import type { PricingConfig, MentoriaPricingConfig } from "@/lib/rental-pricing";
import NovoEventoModal from "./NovoEventoModal";
import EditarEventoModal from "./EditarEventoModal";
import ReservarHiproModal from "./ReservarHiproModal";
import AvailabilityImageModal from "@/components/AvailabilityImageModal";

// `hex` é a mesma cor de `dot`, só que em valor puro — necessário porque o
// indicador do dia no calendário (abaixo) usa conic-gradient via style
// inline quando há mais de um tipo no mesmo dia, e isso não lê classes do
// Tailwind. HIPRO 1/2 ficaram parecidos demais (teal e azul, os dois
// "esverdeados"/claros); trocado o HIPRO 2 para rosa, que também liberou
// o rosa que "Outro" usava antes — foi para o azul que sobrou do HIPRO 2.
// Mentoria ganhou amarelo, uma cor que não existia ainda na paleta.
const EVENT_META: Record<string, { label: string; dot: string; hex: string }> = {
  hipro_1: { label: "HIPRO 1", dot: "bg-brand-teal", hex: "#3DBFB8" },
  hipro_2: { label: "HIPRO 2", dot: "bg-brand-pink", hex: "#E8789A" },
  mentoria: { label: "Mentoria", dot: "bg-yellow-400", hex: "#FACC15" },
  outros: { label: "Outro", dot: "bg-brand-blue", hex: "#7EC8E3" },
};

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

interface EventRow {
  id: string;
  event_type: string;
  title: string;
  date_start: string;
  status: string;
  confirmed: boolean;
  value: number | null;
  client_id: string | null;
  equipment_id: string | null;
  clients?: {
    name: string;
    whatsapp?: string | null;
    // Usados só na mensagem de "pedir confirmação" (ver
    // buildPedidoConfirmacaoMessage), nunca no card em si — o card
    // continua mostrando clients.name, que pode ter mais coisa
    // misturada e serve só para a equipe reconhecer o agendamento.
    treatment?: string | null;
    display_name?: string | null;
  } | null;
  rental_id: string | null;
  notes: string | null;
  taxa_status?: string | null;
  // Quando "Pedir confirmação no WhatsApp" foi clicado para ESTA
  // reserva. Independente de calendar_events.confirmed: pedir e
  // confirmar são ações diferentes (ver os dois botões em renderCard).
  confirmation_message_sent_at?: string | null;
  // Reserva de HIPRO 1/2 marcada como mentoria (leva K): não muda
  // event_type nem equipment_id, só liga o destaque visual abaixo.
  is_mentoria?: boolean;
}

// Centraliza o destaque visual: reserva de equipamento marcada como
// mentoria usa a mesma cor/etiqueta do event_type 'mentoria' avulso,
// mas sem perder qual equipamento é (o rótulo normal continua junto).
function eventMeta(e: EventRow) {
  const base = EVENT_META[e.event_type] ?? { label: e.event_type, dot: "bg-neutral-400", hex: "#a3a3a3" };
  if (e.is_mentoria && (e.event_type === "hipro_1" || e.event_type === "hipro_2")) {
    return { label: `${base.label} · Mentoria`, dot: EVENT_META.mentoria.dot, hex: EVENT_META.mentoria.hex };
  }
  return base;
}

// Indicador de um dia no calendário: quando os eventos daquele dia são
// todos do mesmo tipo, é só um pontinho sólido da cor de sempre. Quando há
// mais de um tipo (ex: um HIPRO 1 e uma Mentoria no mesmo dia), o pontinho
// vira um mini "pizza" dividido nas cores de cada tipo, cada fatia
// proporcional a quantos eventos daquele tipo caem no dia (2 de um + 1 de
// outro = 2/3 + 1/3, não simplesmente 50/50 entre tipos).
function buildDayIndicator(events: EventRow[]): string {
  const cores = events.map((e) => eventMeta(e).hex);
  const unicas = Array.from(new Set(cores));
  if (unicas.length <= 1) return unicas[0] ?? "transparent";
  const contagem = new Map<string, number>();
  for (const c of cores) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  let acumulado = 0;
  const fatias = unicas.map((cor) => {
    const grausFatia = (contagem.get(cor)! / cores.length) * 360;
    const trecho = `${cor} ${acumulado}deg ${acumulado + grausFatia}deg`;
    acumulado += grausFatia;
    return trecho;
  });
  return `conic-gradient(${fatias.join(", ")})`;
}

interface ClientOption {
  id: string;
  name: string;
}

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

function toDateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function parseDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

function formatDiaMes(iso: string) {
  return format(new Date(iso), "dd/MM");
}

// Abre o link do WhatsApp numa aba nova. Era uma tag de link comum antes,
// mas botão evita o bloqueio de pop-up herdado e mantém o mesmo visual.
function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export default function AgendaClient({
  initialEvents,
  clients,
  equipments,
  pricingConfig,
  reservationFee,
  mentoriaPricing,
}: {
  initialEvents: EventRow[];
  clients: ClientOption[];
  equipments: EquipmentOption[];
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  mentoriaPricing?: MentoriaPricingConfig;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [addChooserOpen, setAddChooserOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  // Estado do modal "Pedir confirmação no WhatsApp". Guarda o evento
  // inteiro (não só o id) para o modal sempre mostrar os dados exatos
  // da reserva que foi clicada — nunca de outra reserva da lista nem de
  // uma seleção anterior (era exatamente esse tipo de mistura que o
  // pedido descreveu como bug, mesmo sem ter sido reproduzido aqui).
  const [pedidoEvent, setPedidoEvent] = useState<EventRow | null>(null);
  const [pedidoMessage, setPedidoMessage] = useState("");
  const [pedidoCadastroIncompleto, setPedidoCadastroIncompleto] = useState(false);
  const [pedidoEnviando, setPedidoEnviando] = useState(false);
  const [eventSearch, setEventSearch] = useState("");
  // Aqui o "período" já é o mês que a pessoa está olhando no calendário —
  // trocar de mês É o filtro de período desta tela, então não faz sentido
  // duplicar isso com um segundo seletor. O que faltava eram os filtros
  // por categoria, e são esses dois que entram agora.
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);
  const [confirmadoFiltro, setConfirmadoFiltro] = useState<"todos" | "sim" | "nao">("todos");

  // Chegando aqui pela busca global (ver components/GlobalSearch.tsx), o
  // evento achado vem com a data em ?date= — pula direto pro mês/dia certo
  // em vez de precisar navegar mês a mês até achar.
  useEffect(() => {
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    setCurrentMonth(startOfMonth(parseDate(dateParam)));
    setSelectedDate(dateParam);
  }, [searchParams]);

  // Tipos que realmente existem nos eventos carregados, não uma lista fixa
  // — assim, se um equipamento novo entrar, o filtro já aparece sozinho.
  const tiposDisponiveis = useMemo(() => {
    const vistos = new Map<string, string>();
    for (const e of initialEvents) {
      if (!vistos.has(e.event_type)) {
        vistos.set(e.event_type, EVENT_META[e.event_type]?.label ?? e.event_type);
      }
    }
    return Array.from(vistos.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [initialEvents]);

  const eventosFiltrados = useMemo(() => {
    return initialEvents.filter((e) => {
      if (tipoFiltro && e.event_type !== tipoFiltro) return false;
      if (confirmadoFiltro === "sim" && !e.confirmed) return false;
      if (confirmadoFiltro === "nao" && e.confirmed) return false;
      return true;
    });
  }, [initialEvents, tipoFiltro, confirmadoFiltro]);

  const filtroAtivo = tipoFiltro !== null || confirmadoFiltro !== "todos";

  const eventSearchTerm = eventSearch.trim().toLowerCase();
  const eventMatches = useMemo(() => {
    if (!eventSearchTerm) return [];
    return eventosFiltrados
      .filter((e) => e.title.toLowerCase().includes(eventSearchTerm) || (e.clients?.name ?? "").toLowerCase().includes(eventSearchTerm))
      .slice(0, 8);
  }, [eventosFiltrados, eventSearchTerm]);

  function goToEvent(e: EventRow) {
    setCurrentMonth(startOfMonth(parseDate(e.date_start)));
    setSelectedDate(e.date_start);
    setEventSearch("");
  }

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of eventosFiltrados) {
      const list = map.get(e.date_start) ?? [];
      list.push(e);
      map.set(e.date_start, list);
    }
    return map;
  }, [eventosFiltrados]);

  const needsConfirmation = useMemo(() => {
    const today = parseDate(toDateKey(new Date()));
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    return eventosFiltrados.filter((e) => {
      const d = parseDate(e.date_start);
      return !e.confirmed && d >= today && d <= in7;
    });
  }, [eventosFiltrados]);

  // Resumo do mês aberto no calendário, já com os filtros aplicados — é o
  // "total" desta tela. Não soma o histórico inteiro de propósito: quem
  // está olhando outubro quer saber quanto tem outubro, não o ano todo.
  const resumoMes = useMemo(() => {
    const inicio = startOfMonth(currentMonth);
    const fim = endOfMonth(currentMonth);
    const doMes = eventosFiltrados.filter((e) => {
      const d = parseDate(e.date_start);
      return d >= inicio && d <= fim;
    });
    const porTipo = new Map<string, number>();
    for (const e of doMes) {
      porTipo.set(e.event_type, (porTipo.get(e.event_type) ?? 0) + 1);
    }
    return {
      total: doMes.length,
      eventos: doMes,
      porTipo: Array.from(porTipo.entries())
        .map(([tipo, qtd]) => ({ tipo, label: EVENT_META[tipo]?.label ?? tipo, qtd }))
        .sort((a, b) => b.qtd - a.qtd),
    };
  }, [eventosFiltrados, currentMonth]);

  function baixarCsv() {
    exportarCsv(
      resumoMes.eventos,
      [
        { titulo: "Data", valor: (e) => formatDate(e.date_start) },
        { titulo: "Título", valor: (e) => e.title },
        { titulo: "Tipo", valor: (e) => eventMeta(e).label },
        { titulo: "Cliente", valor: (e) => e.clients?.name ?? "" },
        { titulo: "Confirmado", valor: (e) => (e.confirmed ? "Sim" : "Não") },
        { titulo: "Valor", valor: (e) => e.value ?? "" },
      ],
      "agenda",
      format(currentMonth, "MMMM_yyyy", { locale: ptBR })
    );
  }

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? [];

  // "Confirmar reserva": SÓ muda o status. Nunca abre WhatsApp, nunca
  // manda mensagem — é a correção do bug descrito no pedido, onde as
  // duas coisas aconteciam juntas no mesmo clique. Passa a chamar a
  // RPC confirmar_agendamento (já usada pela ficha do cliente) em vez
  // de um update direto, para ficar registrado no histórico como
  // qualquer outra mudança de status.
  async function toggleConfirmed(event: EventRow) {
    const nextConfirmed = !event.confirmed;
    const { error } = await supabase.rpc("confirmar_agendamento", {
      p_event_id: event.id,
      p_confirmado: nextConfirmed,
    });
    if (error) {
      window.alert("Não foi possível atualizar a confirmação. Tente novamente.");
      return;
    }
    router.refresh();
  }

  // "Pedir confirmação no WhatsApp": abre o modal com os dados desta
  // reserva especificamente (o "event" recebido por parâmetro, nunca um
  // estado global ou uma seleção anterior). Só registra o envio e abre
  // o WhatsApp quando a pessoa de fato confirma no modal — nunca muda
  // calendar_events.confirmed.
  function handlePedirConfirmacao(event: EventRow) {
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      treatment: event.clients?.treatment,
      displayName: event.clients?.display_name,
      dateStart: event.date_start,
    });
    setPedidoEvent(event);
    setPedidoMessage(message);
    setPedidoCadastroIncompleto(cadastroIncompleto);
  }

  async function confirmarEnvioPedido() {
    if (!pedidoEvent) return;
    const link = buildWhatsAppLink(pedidoEvent.clients?.whatsapp, pedidoMessage);
    if (!link) {
      window.alert("Este cliente não tem WhatsApp cadastrado.");
      return;
    }
    setPedidoEnviando(true);
    // Grava o registro do envio (vinculado ao ID desta reserva) antes de
    // abrir o WhatsApp, para não perder o registro se a pessoa fechar a
    // aba antes de voltar. Só isso muda no banco — confirmed continua
    // como estava.
    const { error } = await supabase.rpc("registrar_pedido_confirmacao", {
      p_event_id: pedidoEvent.id,
    });
    setPedidoEnviando(false);
    if (error) {
      window.alert("Não foi possível registrar o envio. Tente novamente.");
      return;
    }
    openInNewTab(link);
    setPedidoEvent(null);
    router.refresh();
  }

  function handleCreated() {
    setModalOpen(false);
    setReservaModalOpen(false);
    router.refresh();
  }

  function goToToday() {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDate(toDateKey(new Date()));
  }

  function renderCard(e: EventRow) {
    const meta = eventMeta(e);
    const isPending = !e.rental_id && !!e.equipment_id && e.status === "pre_reserva";
    return (
      <div
        key={e.id}
        onClick={() => setEditingEvent(e)}
        className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`} />
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{e.title}</p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {meta.label}
                {e.clients?.name ? ` · ${e.clients.name}` : ""}
                {/* "sem disparos ainda" é sobre a contagem de disparos do
                    HIPRO (preço/procedimento), não tem relação com
                    mensagem de confirmação — por isso continua igual. */}
                {isPending ? " · sem disparos ainda" : ""}
              </p>
              {/* Rastreio do pedido de confirmação, por reserva — nunca
                  aparece para quem já está confirmado, porque nesse caso
                  o pedido já cumpriu o papel dele. */}
              {!e.confirmed && (
                <p className="mt-0.5 text-[11px] text-neutral-400">
                  {e.confirmation_message_sent_at
                    ? `✓ mensagem enviada em ${formatDiaMes(e.confirmation_message_sent_at)}`
                    : "sem pedido de confirmação enviado ainda"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              toggleConfirmed(e);
            }}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
              e.confirmed
                ? "bg-brand-teal/10 text-brand-teal"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {e.confirmed ? "Confirmado ✓" : isPending ? "Confirmar reserva" : "Não confirmado"}
          </button>
        </div>

        {/* Ação independente da confirmação: manda a mensagem, nunca
            confirma sozinha (seção 2/3 do pedido). Só faz sentido
            oferecer enquanto a reserva ainda não está confirmada. */}
        {!e.confirmed && (
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              handlePedirConfirmacao(e);
            }}
            className="mt-2 w-full rounded-lg border border-brand-teal/40 py-1.5 text-xs font-medium text-brand-teal hover:bg-brand-teal/5"
          >
            💬 Pedir confirmação no WhatsApp
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Agenda</h1>
        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={() => setAvailabilityOpen(true)}
            className="rounded-xl border border-brand-teal px-3 py-1.5 text-xs font-medium text-brand-teal"
          >
            📅 Datas disponíveis
          </button>
          <button
            onClick={goToToday}
            className="rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            Hoje
          </button>
        </div>
      </div>

      <div className="relative">
        <input
          placeholder="Buscar evento por título ou cliente..."
          value={eventSearch}
          onChange={(e) => setEventSearch(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-sm"
        />
        {eventSearchTerm && (
          <div className="mt-1 w-full overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800 sm:max-w-sm">
            {eventMatches.length === 0 ? (
              <p className="px-3 py-2 text-sm text-neutral-400">Nenhum evento bate com essa busca.</p>
            ) : (
              eventMatches.map((e) => (
                <button
                  key={e.id}
                  onClick={() => goToEvent(e)}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-700"
                >
                  <span className="font-medium text-neutral-800 dark:text-neutral-100">{e.title}</span>
                  <span className="ml-2 text-xs text-neutral-400">
                    {formatDate(e.date_start)}
                    {e.clients?.name ? ` · ${e.clients.name}` : ""}
                  </span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={tipoFiltro ?? ""}
          onChange={(e) => setTipoFiltro(e.target.value || null)}
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <option value="">Todos os tipos</option>
          {tiposDisponiveis.map(([tipo, label]) => (
            <option key={tipo} value={tipo}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={confirmadoFiltro}
          onChange={(e) => setConfirmadoFiltro(e.target.value as "todos" | "sim" | "nao")}
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <option value="todos">Confirmado e não confirmado</option>
          <option value="sim">Só confirmados</option>
          <option value="nao">Só não confirmados</option>
        </select>
        {filtroAtivo && (
          <button
            type="button"
            onClick={() => {
              setTipoFiltro(null);
              setConfirmadoFiltro("todos");
            }}
            className="text-xs text-neutral-400 underline underline-offset-2"
          >
            Limpar filtros
          </button>
        )}
        <button
          type="button"
          onClick={baixarCsv}
          disabled={resumoMes.total === 0}
          className="ml-auto rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
        >
          Exportar CSV do mês
        </button>
      </div>

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {resumoMes.total === 0
          ? `Nenhum evento em ${format(currentMonth, "MMMM", { locale: ptBR })}${filtroAtivo ? " com esse filtro" : ""}.`
          : `${resumoMes.total} ${resumoMes.total === 1 ? "evento" : "eventos"} em ${format(currentMonth, "MMMM", {
              locale: ptBR,
            })}${filtroAtivo ? " (filtrado)" : ""}: ${resumoMes.porTipo.map((t) => `${t.label} ${t.qtd}`).join(" · ")}`}
      </p>

      {needsConfirmation.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
          <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-400">
            ⚠️ Precisam de confirmação (próximos 7 dias)
          </p>
          <div className="space-y-2">{needsConfirmation.map(renderCard)}</div>
        </div>
      )}

      <div className="rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <p className="text-sm font-semibold capitalize text-neutral-900 dark:text-neutral-100">
            {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={i} className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
              {w}
            </div>
          ))}

          {gridDays.map((day) => {
            const key = toDateKey(day);
            const dayEvents = eventsByDate.get(key) ?? [];
            const inMonth = isSameMonth(day, currentMonth);
            const selected = key === selectedDate;
            const today = isToday(day);

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(key)}
                className={`relative mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-xs transition ${
                  selected
                    ? "bg-brand-gradient font-semibold text-white shadow-glow-teal"
                    : today
                    ? "border border-brand-teal text-brand-teal"
                    : inMonth
                    ? "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    : "text-neutral-300 dark:text-neutral-700"
                }`}
              >
                <span>{day.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span
                    className="mt-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ background: selected ? "#ffffff" : buildDayIndicator(dayEvents) }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {formatDate(selectedDate)}
          </p>
          <button
            onClick={() => setAddChooserOpen((v) => !v)}
            className="rounded-xl bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
          >
            + Adicionar
          </button>
        </div>

        {addChooserOpen && (
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => {
                setAddChooserOpen(false);
                setReservaModalOpen(true);
              }}
              className="flex-1 rounded-xl border border-brand-teal py-2 text-xs font-medium text-brand-teal"
            >
              Reservar HIPRO
            </button>
            <button
              onClick={() => {
                setAddChooserOpen(false);
                setModalOpen(true);
              }}
              className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Outro evento
            </button>
          </div>
        )}

        <div className="space-y-2">
          {selectedDayEvents.map(renderCard)}
          {selectedDayEvents.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
              Nenhum evento nesse dia.
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <NovoEventoModal
          clients={clients}
          defaultDate={selectedDate}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {reservaModalOpen && (
        <ReservarHiproModal
          clients={clients}
          equipments={equipments}
          defaultDate={selectedDate}
          onClose={() => setReservaModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editingEvent && (
        <EditarEventoModal
          event={editingEvent}
          clients={clients}
          pricingConfig={pricingConfig}
          reservationFee={reservationFee}
          mentoriaPricing={mentoriaPricing}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            router.refresh();
          }}
          onDeleted={() => {
            setEditingEvent(null);
            router.refresh();
          }}
        />
      )}

      {availabilityOpen && <AvailabilityImageModal mode="agenda" onClose={() => setAvailabilityOpen(false)} />}

      {pedidoEvent && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setPedidoEvent(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white/95 p-5 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Pedir confirmação no WhatsApp
            </h2>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              {pedidoEvent.clients?.name ?? "Cliente"} · {formatDate(pedidoEvent.date_start)}
            </p>

            {pedidoCadastroIncompleto && (
              <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                ⚠️ Cadastro incompleto: falta Tratamento e/ou Nome de exibição deste cliente. Por enquanto a
                mensagem vai com saudação genérica — preencha esses campos no cadastro do cliente para
                personalizar.
              </p>
            )}

            <textarea
              value={pedidoMessage}
              onChange={(e) => setPedidoMessage(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setPedidoEvent(null)}
                className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                Agora não
              </button>
              <button
                type="button"
                disabled={pedidoEnviando}
                onClick={confirmarEnvioPedido}
                className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-center text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              >
                {pedidoEnviando ? "Enviando..." : "Enviar no WhatsApp"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
