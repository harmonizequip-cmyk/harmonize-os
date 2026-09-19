"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import NovoLeadModal from "./NovoLeadModal";
import LeadCardModal from "./LeadCardModal";
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
  data_evento: string | null;
  tags: TagOption[];
  origem: string | null;
  notes: string | null;
  reservation_fee_status: string;
  nextEvent: { date_start: string; confirmed: boolean } | null;
}

export interface TaskRow {
  id: string;
  client_id: string;
  client_name: string;
  type: "contato_inicial" | "followup";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);

  // Mantém o estado local em sincronia sempre que o servidor manda dados
  // novos (ex: depois de um router.refresh()), sem perder a atualização
  // otimista que já tinha sido aplicada na hora do arrasto.
  useEffect(() => {
    setLeads(initialClients);
  }, [initialClients]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

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

  // Toque precisa de um pequeno atraso segurando o card antes de iniciar o
  // arrasto (senão todo swipe pra rolar as colunas seria confundido com um
  // drag). Mouse usa distância mínima, que é instantâneo o suficiente no
  // desktop sem atrapalhar cliques normais no card.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return leads.filter(
      (c) =>
        (c.name.toLowerCase().includes(term) || (c.city ?? "").toLowerCase().includes(term)) &&
        (!tagFilter || c.tags.some((t) => t.id === tagFilter))
    );
  }, [leads, search, tagFilter]);

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

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

  async function markFeePaid(lead: LeadRow) {
    await supabase.from("clients").update({ reservation_fee_status: "pago" }).eq("id", lead.id);
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Funil de vendas</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
        >
          + Novo lead
        </button>
      </div>

      {tasks.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            📋 Tarefas de contato pendentes
          </p>
          <div className="space-y-2">
            {tasks.map((task) => {
              const atrasada = task.due_date < new Date().toISOString().slice(0, 10);
              const busy = taskBusyId === task.id;
              return (
                <div
                  key={task.id}
                  className="flex flex-col gap-2 rounded-xl bg-white/80 p-3 shadow-sm dark:bg-neutral-900/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{task.title}</p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatDate(task.due_date)}
                      {atrasada && (
                        <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          Atrasada
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      disabled={busy}
                      onClick={() => registerContactAttempt(task.id, true)}
                      className="flex-1 rounded-lg bg-brand-teal/10 px-2.5 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-50 sm:flex-none"
                    >
                      ✅ Respondeu
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => registerContactAttempt(task.id, false)}
                      className="flex-1 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs font-medium text-amber-700 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400 sm:flex-none"
                    >
                      🔁 Sem resposta
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <input
        placeholder="Buscar por nome ou cidade..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-sm"
      />

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

      <p className="text-xs text-neutral-400">
        <span className="sm:hidden">Arraste os cards para o lado para mudar de etapa, ou role a tela para ver as outras colunas.</span>
        <span className="hidden sm:inline">Arraste os cards entre as colunas, ou use o botão "Avançar →" em cada um.</span>
      </p>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          className={`flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 scroll-smooth sm:mx-0 sm:px-0 sm:snap-none ${
            activeId ? "" : "snap-x snap-mandatory"
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
                    onMarkFeePaid={() => markFeePaid(lead)}
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

      {modalOpen && <NovoLeadModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
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
  onMarkFeePaid,
  onAvancar,
}: {
  lead: LeadRow;
  stage: (typeof STAGES)[number];
  isDragging: boolean;
  onOpen: () => void;
  onToggleConfirmed: () => void;
  onMarkFeePaid: () => void;
  onAvancar: () => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: lead.id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      className={`touch-none cursor-grab rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand active:cursor-grabbing dark:border-neutral-800/60 dark:bg-neutral-900/55 ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      <LeadCardContent
        lead={lead}
        stage={stage}
        onToggleConfirmed={onToggleConfirmed}
        onMarkFeePaid={onMarkFeePaid}
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
  onMarkFeePaid,
  onAvancar,
}: {
  lead: LeadRow;
  stage: (typeof STAGES)[number];
  floating?: boolean;
  onToggleConfirmed?: () => void;
  onMarkFeePaid?: () => void;
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
      <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{lead.name}</p>
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

      {lead.reservation_fee_status === "pendente" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMarkFeePaid?.();
          }}
          className="mt-1 block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
        >
          💳 Taxa pendente
        </button>
      )}
      {lead.reservation_fee_status === "pago" && (
        <span className="mt-1 block w-fit rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] font-medium text-brand-teal">
          💳 Taxa paga
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
