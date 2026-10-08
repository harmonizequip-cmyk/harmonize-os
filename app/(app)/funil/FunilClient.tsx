"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate, buildWhatsAppLink } from "@/lib/format";
import { buildPedidoConfirmacaoMessage } from "@/lib/confirmacao";
import { exportarCsv } from "@/lib/exportar-csv";
import LeadCardModal from "./LeadCardModal";
import NovaTarefaModal from "./NovaTarefaModal";
import { ORIGENS } from "./NovoLeadModal";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";

import { hojeLocal } from "@/lib/period";
import { CLIENT_STAGES, type ClientStageKey } from "@/lib/funil-clientes";
export const STAGES = [
  { key: "lead", label: "Novo contato", dot: "bg-neutral-400" },
  { key: "contato", label: "Tentativa de contato", dot: "bg-brand-blue" },
  { key: "nutricao", label: "Nutrição", dot: "bg-amber-400" },
  // Saída do funil: lead sem perfil ou que não vai fechar. Fica guardado, sem tarefa.
  { key: "desqualificado", label: "Desqualificado", dot: "bg-red-400" },
  // Está respondendo no WhatsApp: conversa em andamento, antes de demonstrar interesse.
  { key: "em_contato", label: "Em contato", dot: "bg-emerald-500" },
  { key: "qualificado", label: "Interesse", dot: "bg-brand-lilac" },
  { key: "agendado", label: "Agendamento", dot: "bg-brand-pink" },
  { key: "cliente", label: "Cliente", dot: "bg-brand-teal" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

// Funil de leads: termina em "Agendamento". Quem fecha uma locação vira
// cliente (is_client) e passa a aparecer só no funil de clientes.
export const LEAD_STAGES = STAGES.filter((s) => s.key !== "cliente");

type ColunaFunil = { key: string; label: string; dot: string };
type TarefaDoContato = { qtd: number; maisAntiga: string };
type Aba = "leads" | "clientes";

export interface TagOption {
  id: string;
  name: string;
  color: string;
}

export interface LeadRow {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  whatsapp: string | null;
  stage: StageKey;
  is_client?: boolean;
  // Etapa calculada do funil de clientes (null para quem ainda é lead).
  clientStage?: ClientStageKey | null;
  ultimaLocacao?: string | null;
  data_evento: string | null;
  tags: TagOption[];
  origem: string | null;
  notes: string | null;
  parceiro?: boolean;
  treatment?: string | null;
  display_name?: string | null;
  taxasPendentes: number;
  taxasVencidas?: number;
  taxasPagas: number;
  valorPendente: number;
  nextEvent: {
    id: string;
    date_start: string;
    confirmed: boolean;
    confirmation_message_sent_at: string | null;
  } | null;
}

export interface TaskRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  type: "contato_inicial" | "followup" | "manual" | "recontato" | "confirmacao" | "pos_locacao" | "cobranca_taxa";
  follow_up_number: number | null;
  title: string;
  due_date: string;
}

function formatDiaMes(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export default function FunilClient({
  initialClients,
  allTags,
  initialTasks,
}: {
  initialClients: LeadRow[];
  allTags: TagOption[];
  initialTasks: TaskRow[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [leads, setLeads] = useState(initialClients);
  const [tasks, setTasks] = useState(initialTasks);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [aba, setAba] = useState<Aba>("leads");
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [origemFilter, setOrigemFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [confirmAlertOpen, setConfirmAlertOpen] = useState(false);
  const [tasksAlertOpen, setTasksAlertOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false);
  const [pedidoLead, setPedidoLead] = useState<LeadRow | null>(null);
  const [pedidoMessage, setPedidoMessage] = useState("");
  const [pedidoCadastroIncompleto, setPedidoCadastroIncompleto] = useState(false);
  const [pedidoEnviando, setPedidoEnviando] = useState(false);

  useEffect(() => {
    setLeads(initialClients);
  }, [initialClients]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  async function registerContactAttempt(taskId: string, responded: boolean) {
    setTaskBusyId(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const { error } = await supabase.rpc("register_contact_attempt", {
      p_task_id: taskId,
      p_responded: responded,
    });
    setTaskBusyId(null);
    if (error) {
      window.alert(error.message || "Não foi possível registrar o contato. A tarefa continua na lista.");
    }
    router.refresh();
  }

  async function completeManualTask(taskId: string) {
    setTaskBusyId(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const { error } = await supabase
      .from("tasks")
      .update({ status: "concluida", completed_at: new Date().toISOString() })
      .eq("id", taskId);
    setTaskBusyId(null);
    if (error) {
      window.alert(error.message || "Não foi possível concluir a tarefa. Ela continua na lista.");
    }
    router.refresh();
  }

  function handleTaskCreated() {
    setNovaTarefaOpen(false);
    router.refresh();
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const totalLeads = useMemo(() => leads.filter((l) => !l.is_client).length, [leads]);
  const totalClientes = leads.length - totalLeads;
  const colunas: readonly ColunaFunil[] = aba === "leads" ? LEAD_STAGES : CLIENT_STAGES;
  const etapaDe = (c: LeadRow): string => (c.is_client ? c.clientStage ?? "reativar" : c.stage);
  const rotuloEtapa = (c: LeadRow) =>
    (c.is_client ? CLIENT_STAGES : STAGES).find((s) => s.key === etapaDe(c))?.label ?? etapaDe(c);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return leads.filter(
      (c) =>
        (aba === "clientes" ? !!c.is_client : !c.is_client) &&
        (c.name.toLowerCase().includes(term) || (c.city ?? "").toLowerCase().includes(term)) &&
        (!tagFilter || c.tags.some((t) => t.id === tagFilter)) &&
        (!origemFilter || c.origem === origemFilter)
    );
  }, [leads, aba, search, tagFilter, origemFilter]);

  const origemLabel = (valor: string | null) => ORIGENS.find((o) => o.value === valor)?.label ?? valor ?? "";

  function baixarCsv() {
    exportarCsv(
      filtered,
      [
        { titulo: "Nome", valor: (c) => c.name },
        { titulo: "Cidade", valor: (c) => c.city ?? "" },
        { titulo: "Etapa", valor: (c) => rotuloEtapa(c) },
        { titulo: "Origem", valor: (c) => origemLabel(c.origem) },
        { titulo: "Tags", valor: (c) => c.tags.map((t) => t.name).join(", ") },
        { titulo: "Próximo evento", valor: (c) => (c.nextEvent ? formatDate(c.nextEvent.date_start) : "") },
        { titulo: "Taxas pendentes", valor: (c) => c.taxasPendentes },
        { titulo: "Em aberto", valor: (c) => c.valorPendente },
      ],
      aba === "clientes" ? "funil-clientes" : "funil-leads"
    );
  }

  // Tarefas pendentes agrupadas por contato: quantas são e a data da mais
  // antiga. Alimenta o sino de cada etapa e a ordem dos cards. Vem de
  // `tasks`, que perde a tarefa assim que ela é concluída, então o sino e
  // a posição do card se atualizam na hora.
  const tarefasPorContato = useMemo(() => {
    const m = new Map<string, TarefaDoContato>();
    for (const t of tasks) {
      if (!t.client_id) continue;
      const cur = m.get(t.client_id);
      if (!cur) m.set(t.client_id, { qtd: 1, maisAntiga: t.due_date });
      else {
        cur.qtd += 1;
        if (t.due_date < cur.maisAntiga) cur.maisAntiga = t.due_date;
      }
    }
    return m;
  }, [tasks]);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  const pendingConfirmationLeads = useMemo(
    () => leads.filter((l) => l.nextEvent && !l.nextEvent.confirmed),
    [leads]
  );

  async function moveToStage(leadId: string, newStage: StageKey) {
    const etapaAnterior = leads.find((l) => l.id === leadId)?.stage;
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l)));
    const { error } = await supabase.from("clients").update({ stage: newStage }).eq("id", leadId);
    if (error) {
      if (etapaAnterior) {
        setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: etapaAnterior } : l)));
      }
      window.alert(error.message || "Não foi possível mover o card. Ele voltou para a etapa anterior.");
    }
    router.refresh();
  }

  async function avancarEtapa(lead: LeadRow) {
    // "Desqualificado" é saída do funil, não um passo adiante: o botão de
    // avançar pula essa etapa (de Nutrição vai direto para Em contato).
    const caminho = LEAD_STAGES.filter((s) => s.key !== "desqualificado" || lead.stage === "desqualificado");
    const idx = caminho.findIndex((s) => s.key === lead.stage);
    if (idx === -1 || idx === caminho.length - 1) return;
    moveToStage(lead.id, caminho[idx + 1].key);
  }

  async function toggleConfirmed(lead: LeadRow) {
    if (!lead.nextEvent) return;
    const { error } = await supabase.rpc("confirmar_agendamento", {
      p_event_id: lead.nextEvent.id,
      p_confirmado: !lead.nextEvent.confirmed,
    });
    if (error) {
      window.alert("Não foi possível atualizar a confirmação. Tente novamente.");
      return;
    }
    router.refresh();
  }

  function handlePedirConfirmacao(lead: LeadRow) {
    if (!lead.nextEvent) return;
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      name: lead.name,
      treatment: lead.treatment,
      displayName: lead.display_name,
      dateStart: lead.nextEvent.date_start,
    });
    setPedidoLead(lead);
    setPedidoMessage(message);
    setPedidoCadastroIncompleto(cadastroIncompleto);
  }

  async function confirmarEnvioPedido() {
    if (!pedidoLead?.nextEvent) return;
    const link = buildWhatsAppLink(pedidoLead.whatsapp, pedidoMessage);
    if (!link) {
      window.alert("Este cliente não tem WhatsApp cadastrado.");
      return;
    }
    setPedidoEnviando(true);
    const { error } = await supabase.rpc("registrar_pedido_confirmacao", {
      p_event_id: pedidoLead.nextEvent.id,
    });
    setPedidoEnviando(false);
    if (error) {
      window.alert("Não foi possível registrar o envio. Tente novamente.");
      return;
    }
    openInNewTab(link);
    setPedidoLead(null);
    router.refresh();
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const lead = leads.find((l) => l.id === active.id);
    const newStage = over.id as StageKey;
    // Só lead muda de etapa na mão; a etapa do cliente é automática.
    if (lead && !lead.is_client && LEAD_STAGES.some((s) => s.key === newStage) && lead.stage !== newStage) {
      moveToStage(lead.id, newStage);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Funil de vendas</h1>

      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800/60 sm:w-fit">
        {(
          [
            { key: "leads", label: "Leads", total: totalLeads },
            { key: "clientes", label: "Clientes", total: totalClientes },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setAba(t.key)}
            className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none ${
              aba === t.key
                ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-900 dark:text-neutral-100"
                : "text-neutral-500 dark:text-neutral-400"
            }`}
          >
            {t.label} <span className="ml-1 text-xs text-neutral-400">{t.total}</span>
          </button>
        ))}
      </div>

      <div className="sticky top-0 z-20 -mx-4 space-y-2 bg-neutral-50 px-4 pb-2 pt-2 dark:bg-neutral-950 md:static md:mx-0 md:space-y-4 md:bg-transparent md:px-0 md:pb-0 md:pt-0">
        {pendingConfirmationLeads.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-lg dark:border-amber-900/40 dark:bg-amber-900/10 md:shadow-none">
            <button
              onClick={() => setConfirmAlertOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm text-amber-800 dark:text-amber-400"
            >
              <span>
                ⚠️ {pendingConfirmationLeads.length}{" "}
                {pendingConfirmationLeads.length === 1
                  ? "evento de agenda precisa"
                  : "eventos de agenda precisam"}{" "}
                de confirmação
              </span>
              <span className="text-xs">{confirmAlertOpen ? "▲" : "▼"}</span>
            </button>
            {confirmAlertOpen && (
              <div className="max-h-[45vh] space-y-1.5 overflow-y-auto border-t border-amber-200/60 p-3 pt-2 dark:border-amber-900/30 md:max-h-none md:overflow-visible">
                {pendingConfirmationLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="rounded-xl bg-white/70 px-3 py-2 dark:bg-neutral-900/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{lead.name}</p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                          {formatDate(lead.nextEvent!.date_start)}
                        </p>
                        <p className="text-[10px] text-neutral-400">
                          {lead.nextEvent!.confirmation_message_sent_at
                            ? `✓ mensagem enviada em ${formatDiaMes(lead.nextEvent!.confirmation_message_sent_at)}`
                            : "sem pedido de confirmação enviado ainda"}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleConfirmed(lead)}
                        className="flex-shrink-0 rounded-lg bg-brand-teal/10 px-2.5 py-1.5 text-xs font-medium text-brand-teal"
                      >
                        Confirmar
                      </button>
                    </div>
                    <button
                      onClick={() => handlePedirConfirmacao(lead)}
                      className="mt-1.5 w-full rounded-lg border border-brand-teal/40 py-1 text-[11px] font-medium text-brand-teal hover:bg-brand-teal/5"
                    >
                      💬 Pedir confirmação no WhatsApp
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-brand-blue/30 bg-brand-blue/5 shadow-lg dark:border-brand-blue/20 dark:bg-brand-blue/10 md:shadow-none">
          <div className="flex items-center justify-between gap-2 p-3 text-sm text-brand-blue">
            {tasks.length > 0 ? (
              <button
                onClick={() => setTasksAlertOpen((v) => !v)}
                className="flex flex-1 items-center justify-between gap-2 text-left"
              >
                <span>
                  📋 {tasks.length} {tasks.length === 1 ? "tarefa pendente" : "tarefas pendentes"}
                </span>
                <span className="text-xs">{tasksAlertOpen ? "▲" : "▼"}</span>
              </button>
            ) : (
              <span className="flex-1">📋 Nenhuma tarefa pendente</span>
            )}
            <button
              type="button"
              onClick={() => setNovaTarefaOpen(true)}
              aria-label="Nova tarefa"
              className="flex-shrink-0 rounded-full bg-brand-blue/10 p-1.5 text-brand-blue"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
          </div>
          {tasksAlertOpen && tasks.length > 0 && (
            <div className="max-h-[45vh] space-y-1.5 overflow-y-auto border-t border-brand-blue/20 p-3 pt-2 md:max-h-none md:overflow-visible">
              {tasks.map((task) => {
                const atrasada = task.due_date < hojeLocal();
                const busy = taskBusyId === task.id;
                const expanded = expandedTaskId === task.id;
                return (
                  <div key={task.id} className="overflow-hidden rounded-xl bg-white/80 dark:bg-neutral-900/50">
                    <button
                      onClick={() => setExpandedTaskId((cur) => (cur === task.id ? null : task.id))}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span className="text-xs">
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">{task.title}</span>
                        <span className="ml-1.5 text-neutral-500 dark:text-neutral-400">
                          {formatDate(task.due_date)}
                        </span>
                        {atrasada && (
                          <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                            Atrasada
                          </span>
                        )}
                        {task.client_name && (
                          <span className="mt-0.5 block text-[10px] text-neutral-400">{task.client_name}</span>
                        )}
                      </span>
                      <span className="flex-shrink-0 text-[10px] text-neutral-400">{expanded ? "▲" : "▼"}</span>
                    </button>
                    {expanded && (
                      <div className="flex gap-2 border-t border-neutral-100 px-3 py-2 dark:border-neutral-800">
                        {task.type !== "contato_inicial" && task.type !== "followup" ? (
                          <button
                            disabled={busy}
                            onClick={() => completeManualTask(task.id)}
                            className="flex-1 rounded-lg bg-brand-teal/10 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-50"
                          >
                            ✅ Concluir
                          </button>
                        ) : (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => registerContactAttempt(task.id, true)}
                              className="flex-1 rounded-lg bg-brand-teal/10 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-50"
                            >
                              ✅ Respondeu
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => registerContactAttempt(task.id, false)}
                              className="flex-1 rounded-lg bg-amber-100 py-1.5 text-xs font-medium text-amber-700 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400"
                            >
                              🔁 Sem resposta
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Buscar por nome ou cidade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-sm"
        />
        <select
          value={origemFilter ?? ""}
          onChange={(e) => setOrigemFilter(e.target.value || null)}
          className="rounded-lg border border-neutral-300 bg-white px-2.5 py-2 text-xs text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
        >
          <option value="">Todas as origens</option>
          {ORIGENS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={baixarCsv}
          disabled={filtered.length === 0}
          className="ml-auto rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
        >
          Exportar CSV
        </button>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button
              key={t.id}
              onClick={() => setTagFilter((cur) => (cur === t.id ? null : t.id))}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
              style={
                tagFilter === t.id
                  ? { backgroundColor: t.color, color: "#fff" }
                  : { backgroundColor: `${t.color}1A`, color: t.color }
              }
            >
              {t.name}
            </button>
          ))}
        </div>
      )}

      {(search.trim() || tagFilter || origemFilter) && (
        <p className="text-xs text-neutral-400">
          Mostrando {filtered.length} de {aba === "clientes" ? totalClientes : totalLeads}{" "}
          {aba === "clientes" ? "clientes" : "leads"} com esse filtro.
        </p>
      )}

      {aba === "leads" ? (
        <p className="text-xs text-neutral-400">
          <span className="sm:hidden">Arraste os cards para o lado para mudar de etapa, ou role a tela para ver as outras colunas.</span>
          <span className="hidden sm:inline">Arraste os cards entre as colunas, ou use o botão "Avançar →" em cada um.</span>{" "}
          Ao fechar a locação, o lead passa sozinho para a aba Clientes; quem já é cliente antigo pode ser movido
          pelo botão dentro do card.
        </p>
      ) : (
        <p className="text-xs text-neutral-400">
          As etapas dos clientes mudam sozinhas: reserva com taxa pendente fica em Pré-reserva, com taxa paga ou
          isenta vai para Agendamento, locação concluída fica em Cliente e, depois do prazo sem nova locação, cai
          em Reativar.
        </p>
      )}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          className={`flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:snap-none ${
            activeId ? "" : "snap-x snap-proximity"
          }`}
        >
          {colunas.map((stage) => {
            const stageLeads = filtered
              .filter((c) => etapaDe(c) === stage.key)
              .sort((a, b) => {
                // Primeiro a tarefa pendente mais antiga (a mais atrasada
                // no topo); quem concluiu as tarefas, ou não tem nenhuma,
                // desce. Empate ou ausência de tarefa cai na regra abaixo.
                const ta = tarefasPorContato.get(a.id);
                const tb = tarefasPorContato.get(b.id);
                if (ta && !tb) return -1;
                if (!ta && tb) return 1;
                if (ta && tb && ta.maisAntiga !== tb.maisAntiga) return ta.maisAntiga.localeCompare(tb.maisAntiga);
                // Quem tem data de agendamento vem antes de quem não tem, e
                // entre os que têm, o mais próximo (menor data) vem primeiro.
                // Usa nextEvent (reserva já no calendário) e, na falta dela,
                // cai para data_evento (data só prevista, ainda sem reserva).
                const dataA = a.nextEvent?.date_start ?? a.data_evento;
                const dataB = b.nextEvent?.date_start ?? b.data_evento;
                if (!dataA && !dataB) return 0;
                if (!dataA) return 1;
                if (!dataB) return -1;
                return dataA.localeCompare(dataB);
              });
            // Sino da etapa: tarefas pendentes dos contatos que estão nela
            // agora (sem considerar a busca e os filtros de tela).
            let sinoTotal = 0;
            let sinoAtrasadas = 0;
            for (const c of leads) {
              if (!!c.is_client !== (aba === "clientes") || etapaDe(c) !== stage.key) continue;
              const t = tarefasPorContato.get(c.id);
              if (!t) continue;
              sinoTotal += t.qtd;
              if (t.maisAntiga < hojeLocal()) sinoAtrasadas += 1;
            }
            return (
              <FunilColumn
                key={stage.key}
                stage={stage}
                count={stageLeads.length}
                droppable={aba === "leads"}
                sinoTotal={sinoTotal}
                sinoAtrasadas={sinoAtrasadas}
              >
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stage={stage}
                    isDragging={activeId === lead.id}
                    arrastavel={aba === "leads"}
                    tarefa={tarefasPorContato.get(lead.id) ?? null}
                    onOpen={() => setSelected(lead)}
                    onToggleConfirmed={() => toggleConfirmed(lead)}
                    onAvancar={() => avancarEtapa(lead)}
                  />
                ))}
                {stageLeads.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-neutral-400">Vazio</p>
                )}
              </FunilColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeLead ? (
            <LeadCardContent
              lead={activeLead}
              stage={STAGES.find((s) => s.key === activeLead.stage) ?? STAGES[0]}
              floating
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {novaTarefaOpen && (
        <NovaTarefaModal leads={leads} onClose={() => setNovaTarefaOpen(false)} onCreated={handleTaskCreated} />
      )}
      {selected && (
        <LeadCardModal
          lead={selected}
          allTags={allTags}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}

      {pedidoLead && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setPedidoLead(null)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white/95 p-5 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/95 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              Pedir confirmação no WhatsApp
            </h2>
            <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
              {pedidoLead.name} · {pedidoLead.nextEvent ? formatDate(pedidoLead.nextEvent.date_start) : ""}
            </p>

            {pedidoCadastroIncompleto && (
              <p className="mb-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                ⚠️ Não consegui tirar o nome deste cliente do cadastro, então a saudação vai genérica. Ajuste o
                texto abaixo antes de enviar, se quiser.
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
                onClick={() => setPedidoLead(null)}
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

function FunilColumn({
  stage,
  count,
  droppable,
  sinoTotal,
  sinoAtrasadas,
  children,
}: {
  stage: ColunaFunil;
  count: number;
  droppable: boolean;
  sinoTotal: number;
  sinoAtrasadas: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key, disabled: !droppable });

  return (
    <div
      ref={setNodeRef}
      className={`w-[82vw] max-w-[340px] flex-shrink-0 snap-start rounded-2xl p-3 transition sm:w-64 sm:max-w-none sm:snap-align-none ${
        isOver ? "bg-brand-teal/10 ring-2 ring-brand-teal/40" : "bg-neutral-100 dark:bg-neutral-800/60"
      }`}
    >
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
        <p className="text-sm font-semibold text-neutral-700 dark:text-neutral-300">{stage.label}</p>
        <span
          title={
            sinoTotal === 0
              ? "Nenhuma tarefa pendente nesta etapa"
              : `${sinoTotal} ${sinoTotal === 1 ? "tarefa pendente" : "tarefas pendentes"} nesta etapa` +
                (sinoAtrasadas > 0 ? `, ${sinoAtrasadas} ${sinoAtrasadas === 1 ? "contato atrasado" : "contatos atrasados"}` : "")
          }
          className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
            sinoTotal === 0
              ? "text-neutral-300 dark:text-neutral-600"
              : sinoAtrasadas > 0
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : "bg-brand-blue/10 text-brand-blue"
          }`}
        >
          <Bell size={12} strokeWidth={2} />
          {sinoTotal}
        </span>
        <span className="ml-auto text-xs text-neutral-400">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function LeadCard({
  lead,
  stage,
  isDragging,
  arrastavel,
  tarefa,
  onOpen,
  onToggleConfirmed,
  onAvancar,
}: {
  lead: LeadRow;
  stage: ColunaFunil;
  isDragging: boolean;
  arrastavel: boolean;
  tarefa: TarefaDoContato | null;
  onOpen: () => void;
  onToggleConfirmed: () => void;
  onAvancar: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id, disabled: !arrastavel });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={`${
        arrastavel ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      } rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55 ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <LeadCardContent
        lead={lead}
        stage={stage}
        tarefa={tarefa}
        onToggleConfirmed={onToggleConfirmed}
        onAvancar={onAvancar}
      />
    </div>
  );
}

function LeadCardContent({
  lead,
  stage,
  floating,
  tarefa,
  onToggleConfirmed,
  onAvancar,
}: {
  lead: LeadRow;
  stage: ColunaFunil;
  floating?: boolean;
  tarefa?: TarefaDoContato | null;
  onToggleConfirmed?: () => void;
  onAvancar?: () => void;
}) {
  return (
    <div
      className={
        floating
          ? "w-[82vw] max-w-[340px] rounded-xl border border-brand-teal/60 bg-white p-3 shadow-2xl dark:bg-neutral-900 sm:w-64 sm:max-w-none"
          : ""
      }
    >
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
        {lead.name}
      </p>
      {lead.city && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{lead.city}</p>}

      {tarefa && (
        <span
          className={`mt-1 flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            tarefa.maisAntiga < hojeLocal()
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : "bg-brand-blue/10 text-brand-blue"
          }`}
        >
          <Bell size={11} strokeWidth={2} />
          {tarefa.qtd === 1 ? "1 tarefa" : `${tarefa.qtd} tarefas`} · {formatDate(tarefa.maisAntiga)}
          {tarefa.maisAntiga < hojeLocal() ? " · atrasada" : ""}
        </span>
      )}

      {lead.nextEvent ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleConfirmed?.();
          }}
          className={`mt-1 block rounded-full px-2 py-0.5 text-[11px] font-medium ${
            lead.nextEvent.confirmed
              ? "bg-brand-teal/10 text-brand-teal"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }`}
        >
          📅 {formatDate(lead.nextEvent.date_start)} · {lead.nextEvent.confirmed ? "Confirmado" : "Não confirmado"}
        </button>
      ) : (
        lead.data_evento && (
          <p className="mt-1 text-xs text-neutral-400">📅 {formatDate(lead.data_evento)} (previsto)</p>
        )
      )}

      {lead.is_client && (stage.key === "cliente" || stage.key === "reativar") && (
        <p className="mt-1 text-[11px] text-neutral-400">
          {lead.ultimaLocacao ? `Última locação: ${formatDate(lead.ultimaLocacao)}` : "Sem locação registrada"}
        </p>
      )}

      {lead.taxasPendentes > 0 && (
        <span
          className={`mt-1 block w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${
            (lead.taxasVencidas ?? 0) > 0
              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          }`}
        >
          💳 {lead.taxasPendentes === 1 ? "Taxa pendente" : `${lead.taxasPendentes} taxas pendentes`}
          {(lead.taxasVencidas ?? 0) > 0 ? " · vencida" : ""}
          {lead.valorPendente > 0 ? ` · ${formatCurrency(lead.valorPendente)}` : ""}
        </span>
      )}
      {lead.taxasPendentes === 0 && lead.taxasPagas > 0 && (
        <span className="mt-1 block w-fit rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] font-medium text-brand-teal">
          💳 {lead.taxasPagas === 1 ? "Taxa paga" : `${lead.taxasPagas} taxas pagas`}
        </span>
      )}

      {lead.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {lead.tags.map((t) => (
            <span
              key={t.id}
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ backgroundColor: `${t.color}1A`, color: t.color }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
      {!lead.is_client && stage.key !== "agendado" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAvancar?.();
          }}
          className="mt-2 w-full rounded-lg bg-neutral-100 py-1.5 text-xs font-medium text-neutral-600 hover:bg-brand-teal/10 hover:text-brand-teal dark:bg-neutral-800 dark:text-neutral-300"
        >
          Avançar →
        </button>
      )}
    </div>
  );
}
