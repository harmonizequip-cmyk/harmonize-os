"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
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

export const STAGES = [
  { key: "lead", label: "Novo contato", dot: "bg-neutral-400" },
  { key: "contato", label: "Tentativa de contato", dot: "bg-brand-blue" },
  { key: "nutricao", label: "Nutrição", dot: "bg-amber-400" },
  { key: "qualificado", label: "Interesse", dot: "bg-brand-lilac" },
  { key: "agendado", label: "Agendamento", dot: "bg-brand-pink" },
  { key: "cliente", label: "Cliente", dot: "bg-brand-teal" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

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
  // Independente da etapa: uma vez true, mudar "stage" nunca volta isso
  // pra false sozinho (é o próprio gatilho do banco que garante isso,
  // ver migration da leva F). A etapa mostra onde a negociação atual
  // está; is_client mostra se esse contato já converteu alguma vez.
  is_client?: boolean;
  data_evento: string | null;
  tags: TagOption[];
  origem: string | null;
  notes: string | null;
  parceiro?: boolean;
  treatment?: string | null;
  display_name?: string | null;
  // A taxa não é mais um campo do cliente: cada data reservada tem a
  // sua, e estes três números vêm da view clientes_taxas.
  taxasPendentes: number;
  taxasPagas: number;
  valorPendente: number;
  nextEvent: { date_start: string; confirmed: boolean } | null;
}

export interface TaskRow {
  id: string;
  // Tarefa manual pode não ter cliente vinculado (tarefa solta).
  client_id: string | null;
  client_name: string | null;
  type: "contato_inicial" | "followup" | "manual";
  follow_up_number: number | null;
  title: string;
  due_date: string;
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
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [origemFilter, setOrigemFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [confirmAlertOpen, setConfirmAlertOpen] = useState(false);
  const [tasksAlertOpen, setTasksAlertOpen] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false);
  const alertsRef = useRef<HTMLDivElement>(null);
  const [alertsHeight, setAlertsHeight] = useState(0);

  // Mantém o estado local em sincronia sempre que o servidor manda dados
  // novos (ex: depois de um router.refresh()), sem perder a atualização
  // otimista que já tinha sido aplicada na hora do arrasto.
  useEffect(() => {
    setLeads(initialClients);
  }, [initialClients]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // No celular os alertas viram um bloco flutuante fixo (ver abaixo), o que
  // tira eles do fluxo normal da página. Esse observer mede a altura real
  // desse bloco (que muda quando um alerta abre/fecha ou quando a lista de
  // pendências muda) pra reservar o mesmo espaço logo depois, evitando que a
  // busca e o resto da tela pulem pra cima e fiquem escondidas atrás dele.
  useEffect(() => {
    const el = alertsRef.current;
    if (!el) return;
    const update = () => setAlertsHeight(el.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function registerContactAttempt(taskId: string, responded: boolean) {
    // Remove da lista na hora — a tarefa some do painel assim que a
    // pessoa responde, sem esperar o round-trip do servidor.
    setTaskBusyId(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    const { error } = await supabase.rpc("register_contact_attempt", {
      p_task_id: taskId,
      p_responded: responded,
    });
    setTaskBusyId(null);
    if (error) {
      // Se der erro, devolve a tarefa pra lista e deixa o refresh
      // trazer o estado real do servidor.
      router.refresh();
      return;
    }
    router.refresh();
  }

  // Tarefa manual não tem a lógica de follow-up (sem próxima etiqueta, sem
  // criar a próxima tarefa) — é só marcar como feita.
  async function completeManualTask(taskId: string) {
    setTaskBusyId(taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    await supabase.from("tasks").update({ status: "concluida", completed_at: new Date().toISOString() }).eq("id", taskId);
    setTaskBusyId(null);
    router.refresh();
  }

  function handleTaskCreated() {
    setNovaTarefaOpen(false);
    router.refresh();
  }

  // Toque precisa de um pequeno atraso segurando o card antes de iniciar o
  // arrasto (senão todo swipe pra rolar as colunas seria confundido com um
  // drag). Mouse usa distância mínima, que é instantâneo o suficiente no
  // desktop sem atrapalhar cliques normais no card.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  // Sem filtro de período de propósito: o funil mostra quem está em
  // negociação agora, e "quando o lead entrou" não é motivo para ele sumir
  // do quadro — é o mesmo raciocínio da tela de Clientes (uma vez no
  // funil, continua visível até sair dele). Os filtros aqui são todos por
  // característica do lead (busca, tag, origem), nunca por data.
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return leads.filter(
      (c) =>
        (c.name.toLowerCase().includes(term) || (c.city ?? "").toLowerCase().includes(term)) &&
        (!tagFilter || c.tags.some((t) => t.id === tagFilter)) &&
        (!origemFilter || c.origem === origemFilter)
    );
  }, [leads, search, tagFilter, origemFilter]);

  const origemLabel = (valor: string | null) => ORIGENS.find((o) => o.value === valor)?.label ?? valor ?? "";

  function baixarCsv() {
    exportarCsv(
      filtered,
      [
        { titulo: "Nome", valor: (c) => c.name },
        { titulo: "Cidade", valor: (c) => c.city ?? "" },
        { titulo: "Etapa", valor: (c) => STAGES.find((s) => s.key === c.stage)?.label ?? c.stage },
        { titulo: "Origem", valor: (c) => origemLabel(c.origem) },
        { titulo: "Tags", valor: (c) => c.tags.map((t) => t.name).join(", ") },
        { titulo: "Próximo evento", valor: (c) => (c.nextEvent ? formatDate(c.nextEvent.date_start) : "") },
        { titulo: "Taxas pendentes", valor: (c) => c.taxasPendentes },
        { titulo: "Em aberto", valor: (c) => c.valorPendente },
      ],
      "funil"
    );
  }

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  // Eventos de HIPRO aguardando confirmação, separado de propósito das
  // tarefas de contato do funil — são coisas diferentes (agenda x etapa),
  // por isso ficam em alertas distintos em vez de uma lista só.
  const pendingConfirmationLeads = useMemo(
    () => leads.filter((l) => l.nextEvent && !l.nextEvent.confirmed),
    [leads]
  );

  async function moveToStage(leadId: string, newStage: StageKey) {
    // Move na tela imediatamente, sem esperar a resposta do servidor — é
    // isso que faz o arrasto parecer fluido em vez de travado.
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage: newStage } : l)));
    await supabase.from("clients").update({ stage: newStage }).eq("id", leadId);
    router.refresh();
  }

  async function avancarEtapa(lead: LeadRow) {
    const idx = STAGES.findIndex((s) => s.key === lead.stage);
    if (idx === -1 || idx === STAGES.length - 1) return;
    moveToStage(lead.id, STAGES[idx + 1].key);
  }

  async function toggleConfirmed(lead: LeadRow) {
    if (!lead.nextEvent) return;
    await supabase
      .from("calendar_events")
      .update({ confirmed: !lead.nextEvent.confirmed })
      .eq("client_id", lead.id)
      .eq("date_start", lead.nextEvent.date_start);
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
    if (lead && lead.stage !== newStage) {
      moveToStage(lead.id, newStage);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Funil de vendas</h1>

      {/* Os dois alertas abaixo ficam num bloco só, flutuante e fixo no topo
          da tela no celular (logo abaixo do título "Funil de vendas"), pra
          não sumirem de vista quando a página rola ou quando arrasta as
          colunas do funil pro lado. "left-4 right-4" em vez de "inset-x-0"
          é de propósito: fica com respiro nas laterais, sem grudar de ponta
          a ponta na tela. No desktop (md:) volta pro lugar de sempre, dentro
          do fluxo normal da página — lá não existe esse problema de rolagem
          e a barra lateral já ocupa espaço real ao lado do conteúdo. */}
      <div
        ref={alertsRef}
        className="fixed left-4 right-4 top-28 z-20 space-y-2 md:static md:left-auto md:right-auto md:top-auto md:z-auto md:space-y-4"
      >
        {/* Alerta 1: confirmação de agenda do HIPRO — separado de propósito
            das tarefas de etapa do funil abaixo. Fechado por padrão, só
            expande com um toque, igual ao aviso amarelo do Dashboard. */}
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
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 dark:bg-neutral-900/40"
                  >
                    <div>
                      <p className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{lead.name}</p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {formatDate(lead.nextEvent!.date_start)}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleConfirmed(lead)}
                      className="flex-shrink-0 rounded-lg bg-brand-teal/10 px-2.5 py-1.5 text-xs font-medium text-brand-teal"
                    >
                      Confirmar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alerta 2: tarefas (as de contato automáticas do funil e as
            manuais, criadas pelo botão "+" ou pela ficha do cliente). Cada
            tarefa só mostra os botões de ação depois de tocada, pra ficar
            enxuto no celular. Esse bloco fica sempre visível (mesmo sem
            nenhuma pendente), porque o "+" de criar tarefa mora aqui. */}
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
                const atrasada = task.due_date < new Date().toISOString().slice(0, 10);
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
                        {task.type === "manual" ? (
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

      {/* Reserva, só no celular, o espaço que os alertas ocupariam no fluxo
          normal da página — sem isso, a busca e o resto da tela subiriam e
          ficariam escondidas atrás do bloco flutuante fixo acima. No desktop
          os alertas continuam no fluxo normal (md:static), então essa
          reserva não faz efeito nenhum lá (fica com altura 0 visualmente,
          porque a div toda vira "display: none" a partir do md:). */}
      <div style={{ height: alertsHeight }} className="md:hidden" aria-hidden="true" />

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
          Mostrando {filtered.length} de {leads.length} leads com esse filtro.
        </p>
      )}

      <p className="text-xs text-neutral-400">
        <span className="sm:hidden">Arraste os cards para o lado para mudar de etapa, ou role a tela para ver as outras colunas.</span>
        <span className="hidden sm:inline">Arraste os cards entre as colunas, ou use o botão "Avançar →" em cada um.</span>
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        {/* "scroll-smooth" (rolagem suave via CSS) some daqui de propósito:
            junto com "snap-mandatory" ele trava a rolagem no celular, porque
            o navegador fica tentando terminar a animação suave até a coluna
            mais próxima enquanto o dedo ainda está arrastando a tela, e as
            duas coisas disputam a posição do scroll. "proximity" no lugar de
            "mandatory" também ajuda: só encaixa quando você já está perto
            do limite da coluna, em vez de forçar parar em toda coluna. */}
        <div
          className={`flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 sm:snap-none ${
            activeId ? "" : "snap-x snap-proximity"
          }`}
        >
          {STAGES.map((stage) => {
            const stageLeads = filtered.filter((c) => c.stage === stage.key);
            return (
              <FunilColumn key={stage.key} stage={stage} count={stageLeads.length}>
                {stageLeads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    stage={stage}
                    isDragging={activeId === lead.id}
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
              stage={STAGES.find((s) => s.key === activeLead.stage)!}
              floating
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* O antigo botão "+" fixo de "Novo lead" saiu daqui — virou o botão
          "+" global (components/QuickActionsButton.tsx), que fica
          disponível em toda tela e inclui esta opção junto com as outras
          (tarefa, lançamento, evento). */}
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
    </div>
  );
}

function FunilColumn({
  stage,
  count,
  children,
}: {
  stage: (typeof STAGES)[number];
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });

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
  onOpen,
  onToggleConfirmed,
  onAvancar,
}: {
  lead: LeadRow;
  stage: (typeof STAGES)[number];
  isDragging: boolean;
  onOpen: () => void;
  onToggleConfirmed: () => void;
  onAvancar: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });

  return (
    // Sem "touch-none" de propósito: essa classe desliga a rolagem nativa
    // do navegador assim que o dedo toca o card, antes mesmo do sensor de
    // toque (delay: 200, tolerance: 8 lá em cima) ter chance de decidir se
    // é um toque-e-segura (arrastar) ou um deslize rápido (rolar a tela).
    // Sem ela, o navegador rola normalmente em qualquer toque rápido, e só
    // quando o dedo fica parado no card pelos 200ms é que o arrasto assume.
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={`cursor-grab rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand active:cursor-grabbing dark:border-neutral-800/60 dark:bg-neutral-900/55 ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <LeadCardContent
        lead={lead}
        stage={stage}
        onToggleConfirmed={onToggleConfirmed}
        onAvancar={onAvancar}
      />
    </div>
  );
}

// Conteúdo visual do card, compartilhado entre o card real (na coluna) e o
// clone que flutua sob o dedo/cursor durante o arrasto (DragOverlay). O
// clone (floating=true) não tem botões clicáveis, é só a aparência.
function LeadCardContent({
  lead,
  stage,
  floating,
  onToggleConfirmed,
  onAvancar,
}: {
  lead: LeadRow;
  stage: (typeof STAGES)[number];
  floating?: boolean;
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
        {/* Mostra mesmo fora da coluna "Cliente": é possível (e correto)
            um cliente já convertido estar temporariamente numa etapa
            anterior, como "Agendamento" numa segunda locação, sem que
            isso desfaça a conversão — ver leva F. */}
        {lead.is_client && stage.key !== "cliente" && (
          <span className="ml-1.5 rounded-full bg-brand-teal/10 px-1.5 py-0.5 align-middle text-[10px] font-medium text-brand-teal">
            Cliente
          </span>
        )}
      </p>
      {lead.city && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{lead.city}</p>}

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

      {/* Etiqueta, não botão. Com várias datas reservadas, "marcar paga"
          daqui não diria qual delas, e era exatamente essa ambiguidade que
          o campo antigo no cliente escondia. Abrir o card leva aos botões
          por agendamento, que é onde a pergunta tem resposta. */}
      {lead.taxasPendentes > 0 && (
        <span className="mt-1 block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          💳 {lead.taxasPendentes === 1 ? "Taxa pendente" : `${lead.taxasPendentes} taxas pendentes`}
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
      {stage.key !== "cliente" && (
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
