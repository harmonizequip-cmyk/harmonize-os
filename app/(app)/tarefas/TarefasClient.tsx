"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";

import { hojeLocal } from "@/lib/period";
export interface TarefaRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  type: "contato_inicial" | "followup" | "manual" | "recontato" | "confirmacao" | "pos_locacao" | "cobranca_taxa";
  follow_up_number: number | null;
  title: string;
  due_date: string;
  completed_at: string | null;
}

// Visão única de todas as tarefas do sistema — as automáticas do funil e as
// manuais, pendentes e concluídas — porque o painel do Funil só mostra as
// pendentes, e às vezes você quer conferir o que já foi feito ou procurar
// algo sem precisar navegar pelas etapas do funil.
export default function TarefasClient({
  initialPendentes,
  initialConcluidas,
}: {
  initialPendentes: TarefaRow[];
  initialConcluidas: TarefaRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const [pendentes, setPendentes] = useState(initialPendentes);
  const [concluidas, setConcluidas] = useState(initialConcluidas);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Adiar (pendente -> nova data): não tem regra de negócio nenhuma por
  // trás, é só trocar due_date — por isso vai direto, sem RPC.
  const [adiarTaskId, setAdiarTaskId] = useState<string | null>(null);
  const [adiarData, setAdiarData] = useState("");
  const [adiarErro, setAdiarErro] = useState<string | null>(null);

  // Desfazer conclusão: tarefa de funil pode ter criado a tarefa de
  // follow-up seguinte ao ser concluída, então passa pela RPC
  // desfazer_conclusao_tarefa (leva V), que cuida de desfazer isso com
  // segurança (ou bloquear se a tarefa seguinte já foi mexida).
  const [desfazerErro, setDesfazerErro] = useState<Record<string, string>>({});

  useEffect(() => {
    setPendentes(initialPendentes);
  }, [initialPendentes]);

  useEffect(() => {
    setConcluidas(initialConcluidas);
  }, [initialConcluidas]);

  // Chegando aqui pela busca global (ver components/GlobalSearch.tsx),
  // a tarefa achada vem com o id em ?highlight= — abre ela expandida e
  // rola até ela, pra não precisar procurar de novo na lista.
  useEffect(() => {
    const highlight = searchParams.get("highlight");
    if (!highlight) return;
    setExpandedTaskId(highlight);
    const el = document.getElementById(`task-${highlight}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [searchParams]);

  const term = search.trim().toLowerCase();
  const filteredPendentes = useMemo(
    () =>
      term
        ? pendentes.filter((t) => t.title.toLowerCase().includes(term) || (t.client_name ?? "").toLowerCase().includes(term))
        : pendentes,
    [pendentes, term]
  );
  const filteredConcluidas = useMemo(
    () =>
      term
        ? concluidas.filter((t) => t.title.toLowerCase().includes(term) || (t.client_name ?? "").toLowerCase().includes(term))
        : concluidas,
    [concluidas, term]
  );

  async function registerContactAttempt(taskId: string, responded: boolean) {
    setTaskBusyId(taskId);
    setPendentes((prev) => prev.filter((t) => t.id !== taskId));
    const { error } = await supabase.rpc("register_contact_attempt", { p_task_id: taskId, p_responded: responded });
    setTaskBusyId(null);
    if (error) {
      window.alert(error.message || "Não foi possível registrar o contato. A tarefa continua na lista.");
    }
    router.refresh();
  }

  async function completeManualTask(taskId: string) {
    setTaskBusyId(taskId);
    setPendentes((prev) => prev.filter((t) => t.id !== taskId));
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

  async function adiarTarefa(taskId: string) {
    if (!adiarData) {
      setAdiarErro("Escolha a nova data.");
      return;
    }
    setTaskBusyId(taskId);
    setAdiarErro(null);
    const { error } = await supabase.from("tasks").update({ due_date: adiarData }).eq("id", taskId);
    setTaskBusyId(null);
    if (error) {
      setAdiarErro(error.message || "Não foi possível adiar. Tente novamente.");
      return;
    }
    setAdiarTaskId(null);
    setAdiarData("");
    router.refresh();
  }

  async function desfazerConclusao(taskId: string) {
    if (!window.confirm("Desfazer a conclusão desta tarefa? Ela volta pra lista de pendentes.")) return;
    setTaskBusyId(taskId);
    setDesfazerErro((prev) => {
      const { [taskId]: _omit, ...rest } = prev;
      return rest;
    });
    const { error } = await supabase.rpc("desfazer_conclusao_tarefa", { p_task_id: taskId });
    setTaskBusyId(null);
    if (error) {
      setDesfazerErro((prev) => ({ ...prev, [taskId]: error.message || "Não foi possível desfazer. Tente novamente." }));
      return;
    }
    setConcluidas((prev) => prev.filter((t) => t.id !== taskId));
    router.refresh();
  }

  const todayStr = hojeLocal();

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Tarefas</h1>

      <input
        placeholder="Buscar por título ou cliente..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 sm:max-w-sm"
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-brand-blue">
          📋 Pendentes {filteredPendentes.length > 0 && `(${filteredPendentes.length})`}
        </h2>
        {filteredPendentes.length === 0 ? (
          <p className="text-sm text-neutral-400">
            {term ? "Nenhuma tarefa pendente bate com essa busca." : 'Nenhuma tarefa pendente. Use o botão "+" pra criar uma.'}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredPendentes.map((task) => {
              const atrasada = task.due_date < todayStr;
              const busy = taskBusyId === task.id;
              const expanded = expandedTaskId === task.id;
              return (
                <div
                  key={task.id}
                  id={`task-${task.id}`}
                  className="overflow-hidden rounded-xl border border-brand-blue/20 bg-brand-blue/5 dark:border-brand-blue/15 dark:bg-brand-blue/10"
                >
                  <button
                    onClick={() => setExpandedTaskId((cur) => (cur === task.id ? null : task.id))}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="text-xs">
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">{task.title}</span>
                      <span className="ml-1.5 text-neutral-500 dark:text-neutral-400">{formatDate(task.due_date)}</span>
                      {atrasada && (
                        <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-900/30 dark:text-red-400">
                          Atrasada
                        </span>
                      )}
                      {task.client_name && task.client_id && (
                        <Link
                          href={`/clientes/${task.client_id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-0.5 block w-fit text-[10px] text-brand-blue underline underline-offset-2"
                        >
                          {task.client_name}
                        </Link>
                      )}
                    </span>
                    <span className="flex-shrink-0 text-[10px] text-neutral-400">{expanded ? "▲" : "▼"}</span>
                  </button>
                  {expanded && (
                    <div className="border-t border-brand-blue/10 px-3 py-2 dark:border-brand-blue/15">
                      <div className="flex gap-2">
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
                        {adiarTaskId !== task.id && (
                          <button
                            disabled={busy}
                            onClick={() => {
                              setAdiarTaskId(task.id);
                              setAdiarData(task.due_date);
                              setAdiarErro(null);
                            }}
                            className="rounded-lg border border-neutral-300 px-3 text-xs font-medium text-neutral-500 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-400"
                          >
                            📅 Adiar
                          </button>
                        )}
                      </div>

                      {adiarTaskId === task.id && (
                        <div className="mt-2 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/50">
                          <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                            Nova data
                          </label>
                          <input
                            type="date"
                            value={adiarData}
                            onChange={(e) => setAdiarData(e.target.value)}
                            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                          />
                          {adiarErro && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{adiarErro}</p>}
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAdiarTaskId(null);
                                setAdiarErro(null);
                              }}
                              className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                            >
                              Desistir
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => adiarTarefa(task.id)}
                              className="flex-1 rounded-lg bg-neutral-900 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                            >
                              {busy ? "Salvando..." : "Confirmar nova data"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          ✅ Concluídas {filteredConcluidas.length > 0 && `(últimas ${filteredConcluidas.length})`}
        </h2>
        {filteredConcluidas.length === 0 ? (
          <p className="text-sm text-neutral-400">
            {term ? "Nenhuma tarefa concluída bate com essa busca." : "Nenhuma tarefa concluída ainda."}
          </p>
        ) : (
          <div className="space-y-1.5">
            {filteredConcluidas.map((task) => {
              const expanded = expandedTaskId === task.id;
              const busy = taskBusyId === task.id;
              const erro = desfazerErro[task.id];
              return (
                <div
                  key={task.id}
                  id={`task-${task.id}`}
                  className="overflow-hidden rounded-xl bg-neutral-100/70 dark:bg-neutral-800/40"
                >
                  <button
                    onClick={() => setExpandedTaskId((cur) => (cur === task.id ? null : task.id))}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                  >
                    <div>
                      <p className="font-medium text-neutral-500 line-through decoration-neutral-400 dark:text-neutral-400">
                        {task.title}
                      </p>
                      {task.client_name && <p className="text-[10px] text-neutral-400">{task.client_name}</p>}
                    </div>
                    <span className="flex-shrink-0 text-[10px] text-neutral-400">
                      {task.completed_at ? formatDate(task.completed_at.slice(0, 10)) : ""}
                    </span>
                  </button>
                  {expanded && (
                    <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
                      <button
                        disabled={busy}
                        onClick={() => desfazerConclusao(task.id)}
                        className="w-full rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        {busy ? "Desfazendo..." : "↩️ Desfazer conclusão (foi engano)"}
                      </button>
                      {erro && <p className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">{erro}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
