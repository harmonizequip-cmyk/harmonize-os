"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

// Uma linha por agendamento do cliente, já com o rótulo de situação
// resolvido pelo banco. A função agendamentos_do_cliente é quem combina
// os dois eixos (status da locação e marca de confirmado) num rótulo só,
// de propósito: se cada tela recombinasse por conta própria, uma hora
// duas telas mostrariam situações diferentes para o mesmo agendamento.
interface Agendamento {
  event_id: string;
  rental_id: string | null;
  equipamento: string;
  data: string;
  status: string;
  confirmado: boolean;
  valor: number | null;
  disparos: number | null;
  situacao: "agendado" | "confirmado" | "realizado" | "cancelado";
}

const SITUACAO_META: Record<string, { label: string; classe: string }> = {
  agendado: {
    label: "Agendado",
    classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  confirmado: { label: "Confirmado", classe: "bg-brand-teal/10 text-brand-teal" },
  realizado: { label: "Realizado", classe: "bg-brand-blue/10 text-brand-blue" },
  cancelado: { label: "Cancelado", classe: "bg-brand-pink/10 text-brand-pink" },
};

export default function AgendamentosDoCliente({
  clientId,
  onChanged,
}: {
  clientId: string;
  onChanged?: () => void;
}) {
  const supabase = createClient();
  const [itens, setItens] = useState<Agendamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [reagendando, setReagendando] = useState<string | null>(null);
  const [novaData, setNovaData] = useState("");

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("agendamentos_do_cliente", {
      p_client_id: clientId,
    });
    setCarregando(false);
    if (error) {
      setErro(error.message || "Não foi possível carregar os agendamentos.");
      return;
    }
    setErro(null);
    setItens((data ?? []) as Agendamento[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Toda ação passa por aqui: chama a função do banco, mostra o erro
  // exatamente como o banco mandou (as mensagens já são escritas para
  // quem usa, do tipo "o equipamento já está reservado em 25/10 para
  // Fulano") e recarrega a lista.
  async function executar(fn: string, args: Record<string, unknown>, chave: string) {
    setOcupado(chave);
    setErro(null);
    const { error } = await supabase.rpc(fn, args);
    setOcupado(null);
    if (error) {
      setErro(error.message || "Não foi possível concluir a ação.");
      return;
    }
    setReagendando(null);
    setNovaData("");
    await carregar();
    onChanged?.();
  }

  function confirmarReagendamento(eventId: string) {
    if (!novaData) {
      setErro("Escolha a nova data.");
      return;
    }
    executar("reagendar_agendamento", { p_event_id: eventId, p_nova_data: novaData }, eventId);
  }

  function cancelar(eventId: string) {
    const motivo = window.prompt("Motivo do cancelamento (opcional):") ?? "";
    if (motivo === null) return;
    executar("cancelar_agendamento", { p_event_id: eventId, p_motivo: motivo }, eventId);
  }

  if (carregando) {
    return <p className="mt-4 text-xs text-neutral-400">Carregando agendamentos...</p>;
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
        Agendamentos
      </p>

      {erro && (
        <div className="mb-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
          {erro}
        </div>
      )}

      {itens.length === 0 && (
        <p className="rounded-xl border border-dashed border-neutral-300/70 py-4 text-center text-xs text-neutral-400 dark:border-neutral-700/60">
          Nenhum agendamento para este cliente ainda.
        </p>
      )}

      <div className="space-y-2">
        {itens.map((a) => {
          const meta = SITUACAO_META[a.situacao] ?? {
            label: a.situacao,
            classe: "bg-neutral-100 text-neutral-600",
          };
          const trabalhando = ocupado === a.event_id;

          return (
            <div
              key={a.event_id}
              className="rounded-xl border border-neutral-200 p-2.5 dark:border-neutral-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.classe}`}>
                  {meta.label}
                </span>
                <span className="text-xs font-medium text-neutral-800 dark:text-neutral-100">
                  {a.equipamento}
                </span>
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDate(a.data)}
                </span>
                {a.valor != null && (
                  <span className="ml-auto text-xs font-medium text-brand-teal">
                    {formatCurrency(Number(a.valor))}
                  </span>
                )}
              </div>

              {a.rental_id == null && a.situacao !== "cancelado" && (
                <p className="mt-1 text-[11px] text-neutral-400">
                  Sem disparos lançados ainda. Finalize pela Agenda quando o procedimento acontecer.
                </p>
              )}

              {reagendando === a.event_id ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={novaData}
                    onChange={(e) => setNovaData(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <button
                    type="button"
                    disabled={trabalhando}
                    onClick={() => confirmarReagendamento(a.event_id)}
                    className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {trabalhando ? "Movendo..." : "Mover para esta data"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReagendando(null);
                      setNovaData("");
                      setErro(null);
                    }}
                    className="text-xs text-neutral-500 underline underline-offset-2"
                  >
                    Desistir
                  </button>
                </div>
              ) : (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {a.situacao === "agendado" && (
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() =>
                        executar(
                          "confirmar_agendamento",
                          { p_event_id: a.event_id, p_confirmado: true },
                          a.event_id
                        )
                      }
                      className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      Confirmar
                    </button>
                  )}

                  {a.situacao === "confirmado" && a.rental_id && (
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() =>
                        executar(
                          "marcar_realizada",
                          { p_rental_id: a.rental_id, p_realizada: true },
                          a.event_id
                        )
                      }
                      className="rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                    >
                      Realizado
                    </button>
                  )}

                  {a.situacao === "realizado" && a.rental_id && (
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() =>
                        executar(
                          "marcar_realizada",
                          { p_rental_id: a.rental_id, p_realizada: false },
                          a.event_id
                        )
                      }
                      className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
                    >
                      Desfazer realizado
                    </button>
                  )}

                  {a.situacao === "cancelado" ? (
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() =>
                        executar("reativar_agendamento", { p_event_id: a.event_id }, a.event_id)
                      }
                      className="rounded-lg border border-brand-teal px-3 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-60"
                    >
                      Reativar
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={trabalhando}
                        onClick={() => {
                          setReagendando(a.event_id);
                          setNovaData(a.data);
                          setErro(null);
                        }}
                        className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        Reagendar
                      </button>
                      <button
                        type="button"
                        disabled={trabalhando}
                        onClick={() => cancelar(a.event_id)}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
