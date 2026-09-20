"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";

export interface TarefaRow {
  id: string;
  client_id: string | null;
  client_name: string | null;
  type: "contato_inicial" | "followup" | "manual";
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
  const supabase = createClient();
  const [pendentes, setPendentes] = useState(initialPendentes);
  const [concluidas, setConcluidas] = useState(initialConcluidas);
  const [taskBusyId, setTaskBusyId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  useEffect(() => {
    setPendentes(initialPendentes);
  }, [initialPendentes]);

  useEffect(() => {
    setConcluidas(initialConcluidas);
  }, [initialConcluidas]);

  async function registerContactAttempt(taskId: string, responded: boolean) {
    setTaskBusyId(taskId);
    setPendentes((prev) => prev.filter((t) => t.id !== taskId));
    await supabase.rpc("register_contact_attempt", { p_task_id: taskId, p_responded: responded });
    setTaskBusyId(null);
    router.refresh();
  }

  async function completeManualTask(taskId: string) {
    setTaskBusyId(taskId);
    setPendentes((prev) => prev.filter((t) => t.id !== taskId));
    await supabase.from("tasks").update({ status: "concluida", completed_at: new Date().toISOString() }).eq("id", taskId);
    setTaskBusyId(null);
    router.refresh();
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Tarefas</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-brand-blue">
          📋 Pendentes {pendentes.length > 0 && `(${pendentes.length})`}
        </h2>
        {pendentes.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma tarefa pendente. Use o botão "+" pra criar uma.</p>
        ) : (
          <div className="space-y-1.5">
            {pendentes.map((task) => {
              const atrasada = task.due_date < todayStr;
              const busy = taskBusyId === task.id;
              const expanded = expandedTaskId === task.id;
              return (
                <div
                  key={task.id}
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
                    <div className="flex gap-2 border-t border-brand-blue/10 px-3 py-2 dark:border-brand-blue/15">
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
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-neutral-500 dark:text-neutral-400">
          ✅ Concluídas {concluidas.length > 0 && `(últimas ${concluidas.length})`}
        </h2>
        {concluidas.length === 0 ? (
          <p className="text-sm text-neutral-400">Nenhuma tarefa concluída ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {concluidas.map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-neutral-100/70 px-3 py-2 text-xs dark:bg-neutral-800/40"
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
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
