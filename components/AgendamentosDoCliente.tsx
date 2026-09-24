"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

// Uma linha por agendamento do cliente, já com o rótulo de situação
// resolvido pelo banco. A função agendamentos_do_cliente é quem combina
// os dois eixos (status da locação e marca de confirmado) num rótulo só,
// de propósito: se cada tela recombinasse por conta própria, uma hora
// duas telas mostrariam situações diferentes para o mesmo agendamento.
//
// Desde a Leva C3a há um terceiro eixo, o dinheiro, e ele é independente
// da situação: locação realizada pode estar paga ou não, e é só quando
// alguém marca o pagamento que o lançamento financeiro nasce. Por isso
// os controles aqui vêm em duas faixas separadas, Situação e Dinheiro:
// misturar os botões faria parecer que realizar já cobra.
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
  taxa_status: "nao_aplica" | "pendente" | "paga" | "perdida";
  taxa_valor: number | null;
  pago: boolean;
  pago_em: string | null;
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

const TAXA_META: Record<string, { label: string; classe: string }> = {
  pendente: {
    label: "Taxa pendente",
    classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  paga: { label: "Taxa paga", classe: "bg-brand-teal/10 text-brand-teal" },
  perdida: {
    label: "Taxa perdida",
    classe: "bg-neutral-200 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300",
  },
};

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

const BOTAO_PRIMARIO =
  "rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60";
const BOTAO_AZUL =
  "rounded-lg bg-brand-blue px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60";
const BOTAO_NEUTRO =
  "rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300";
const BOTAO_VERMELHO =
  "rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400";

function hoje(): string {
  return new Date().toISOString().slice(0, 10);
}

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
  // Painel de pagamento: forma e data são escolhidas na hora, porque o
  // dinheiro pode entrar por caminho diferente do que foi combinado e em
  // dia diferente do procedimento.
  const [pagando, setPagando] = useState<string | null>(null);
  const [formaPagamento, setFormaPagamento] = useState("pix");
  const [dataPagamento, setDataPagamento] = useState(hoje());

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
    setPagando(null);
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
    executar("cancelar_agendamento", { p_event_id: eventId, p_motivo: motivo }, eventId);
  }

  function confirmarPagamento(a: Agendamento) {
    if (!a.rental_id) return;
    if (!dataPagamento) {
      setErro("Escolha a data em que o dinheiro entrou.");
      return;
    }
    executar(
      "marcar_locacao_paga",
      {
        p_rental_id: a.rental_id,
        p_payment_method: formaPagamento,
        p_data: dataPagamento,
      },
      a.event_id
    );
  }

  function abrirPagamento(a: Agendamento) {
    setPagando(a.event_id);
    setReagendando(null);
    setFormaPagamento("pix");
    setDataPagamento(hoje());
    setErro(null);
  }

  function taxa(eventId: string, status: string) {
    executar(
      "definir_taxa_agendamento",
      { p_event_id: eventId, p_status: status, p_payment_method: "pix" },
      eventId
    );
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
          const metaTaxa = TAXA_META[a.taxa_status];
          const trabalhando = ocupado === a.event_id;
          const cancelado = a.situacao === "cancelado";
          const credito = a.taxa_status === "paga" ? Number(a.taxa_valor ?? 0) : 0;
          const aReceber = Math.max(Number(a.valor ?? 0) - credito, 0);

          return (
            <div
              key={a.event_id}
              className="rounded-xl border border-neutral-200 p-2.5 dark:border-neutral-700"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.classe}`}>
                  {meta.label}
                </span>
                {metaTaxa && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${metaTaxa.classe}`}
                  >
                    {metaTaxa.label}
                    {a.taxa_valor != null ? ` ${formatCurrency(Number(a.taxa_valor))}` : ""}
                  </span>
                )}
                {a.rental_id && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      a.pago
                        ? "bg-brand-teal/10 text-brand-teal"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}
                  >
                    {a.pago ? "Pago" : "A receber"}
                  </span>
                )}
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

              {a.rental_id == null && !cancelado && (
                <p className="mt-1 text-[11px] text-neutral-400">
                  Sem disparos lançados ainda. Finalize pela Agenda quando o procedimento acontecer.
                </p>
              )}

              {/* O crédito da taxa é a parte que mais gera dúvida na hora
                  de cobrar, então aparece escrito, com a conta feita. */}
              {a.rental_id && !a.pago && credito > 0 && !cancelado && (
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  A taxa de {formatCurrency(credito)} já está paga e entra como crédito: faltam{" "}
                  <span className="font-medium text-brand-teal">{formatCurrency(aReceber)}</span>.
                </p>
              )}

              {a.pago && a.pago_em && (
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  Pagamento registrado em {formatDate(a.pago_em)}.
                </p>
              )}

              {a.taxa_status === "perdida" && (
                <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
                  O cliente cancelou depois de pagar a taxa, então o valor ficou como receita e não
                  vira crédito. Reativar o agendamento devolve a taxa.
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
                    className={BOTAO_AZUL}
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
              ) : pagando === a.event_id ? (
                <div className="mt-2 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/50">
                  <p className="mb-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                    Vai lançar {formatCurrency(aReceber)} no financeiro
                    {credito > 0 ? `, já descontado o crédito de ${formatCurrency(credito)}` : ""}.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={formaPagamento}
                      onChange={(e) => setFormaPagamento(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    >
                      {FORMAS.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={dataPagamento}
                      onChange={(e) => setDataPagamento(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => confirmarPagamento(a)}
                      className={BOTAO_PRIMARIO}
                    >
                      {trabalhando ? "Registrando..." : "Confirmar pagamento"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPagando(null);
                        setErro(null);
                      }}
                      className="text-xs text-neutral-500 underline underline-offset-2"
                    >
                      Desistir
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* FAIXA 1: situação do agendamento */}
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
                        className={BOTAO_PRIMARIO}
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
                        className={BOTAO_AZUL}
                      >
                        Realizado
                      </button>
                    )}

                    {a.situacao === "realizado" && a.rental_id && !a.pago && (
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
                        className={BOTAO_NEUTRO}
                      >
                        Desfazer realizado
                      </button>
                    )}

                    {cancelado ? (
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
                            setPagando(null);
                            setErro(null);
                          }}
                          className={BOTAO_NEUTRO}
                        >
                          Reagendar
                        </button>
                        <button
                          type="button"
                          disabled={trabalhando}
                          onClick={() => cancelar(a.event_id)}
                          className={BOTAO_VERMELHO}
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>

                  {/* FAIXA 2: dinheiro. Some inteira em agendamento
                      cancelado, onde não há nada a receber nem taxa a
                      mexer: a taxa paga já virou perdida no banco. */}
                  {!cancelado && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 border-t border-neutral-100 pt-1.5 dark:border-neutral-700/50">
                      <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
                        Dinheiro
                      </span>

                      {a.rental_id && !a.pago && (
                        <button
                          type="button"
                          disabled={trabalhando}
                          onClick={() => abrirPagamento(a)}
                          className={BOTAO_PRIMARIO}
                        >
                          Marcar pago
                        </button>
                      )}

                      {a.rental_id && a.pago && (
                        <button
                          type="button"
                          disabled={trabalhando}
                          onClick={() =>
                            executar(
                              "desfazer_pagamento_locacao",
                              { p_rental_id: a.rental_id },
                              a.event_id
                            )
                          }
                          className={BOTAO_NEUTRO}
                        >
                          Desfazer pagamento
                        </button>
                      )}

                      {a.taxa_status === "nao_aplica" && (
                        <button
                          type="button"
                          disabled={trabalhando}
                          onClick={() => taxa(a.event_id, "pendente")}
                          className={BOTAO_NEUTRO}
                        >
                          Cobrar taxa
                        </button>
                      )}

                      {a.taxa_status === "pendente" && (
                        <>
                          <button
                            type="button"
                            disabled={trabalhando}
                            onClick={() => taxa(a.event_id, "paga")}
                            className={BOTAO_PRIMARIO}
                          >
                            Taxa recebida
                          </button>
                          <button
                            type="button"
                            disabled={trabalhando}
                            onClick={() => taxa(a.event_id, "nao_aplica")}
                            className={BOTAO_NEUTRO}
                          >
                            Isentar taxa
                          </button>
                        </>
                      )}

                      {a.taxa_status === "paga" && (
                        <button
                          type="button"
                          disabled={trabalhando}
                          onClick={() => taxa(a.event_id, "pendente")}
                          className={BOTAO_NEUTRO}
                        >
                          Desfazer taxa
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
