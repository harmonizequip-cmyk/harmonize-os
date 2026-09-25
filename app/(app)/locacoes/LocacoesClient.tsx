"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Periodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import { exportarCsv } from "@/lib/exportar-csv";

const PAGAMENTOS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

interface Locacao {
  id: string;
  event_date: string;
  shots: number;
  calculated_value: number;
  payment_method: string;
  status: string;
  pago: boolean;
  pago_em: string | null;
  rescheduled: boolean;
  client_id: string;
  clients?: { name: string } | null;
  equipments?: { name: string } | null;
}

function situacao(r: Locacao): { label: string; classe: string } {
  if (r.status === "cancelada") {
    return { label: "Cancelada", classe: "bg-brand-pink/10 text-brand-pink" };
  }
  if (r.pago) {
    return { label: "Paga", classe: "bg-brand-teal/10 text-brand-teal" };
  }
  if (r.status === "realizada") {
    return {
      label: "A receber",
      classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    };
  }
  return { label: "Agendada", classe: "bg-brand-blue/10 text-brand-blue" };
}

export default function LocacoesClient({
  linhas,
  clients,
  equipments,
  periodo,
  atingiuTeto,
}: {
  linhas: Locacao[];
  clients: { id: string; name: string }[];
  equipments: { id: string; name: string }[];
  periodo: Periodo;
  atingiuTeto: boolean;
}) {
  // Três totais em vez de um. "Faturado" somando tudo seria mentira:
  // cancelada não é receita, e realizada sem pagamento é dinheiro que
  // ainda não entrou. Separar é o que faz o número poder ser usado.
  const totais = useMemo(() => {
    let recebido = 0;
    let aReceber = 0;
    let cancelado = 0;
    let disparos = 0;
    for (const r of linhas) {
      const valor = Number(r.calculated_value);
      if (r.status === "cancelada") {
        cancelado += valor;
        continue;
      }
      disparos += Number(r.shots ?? 0);
      if (r.pago) recebido += valor;
      else aReceber += valor;
    }
    return { recebido, aReceber, cancelado, disparos };
  }, [linhas]);

  function baixarCsv() {
    exportarCsv(
      linhas,
      [
        { titulo: "Data", valor: (r) => formatDate(r.event_date) },
        { titulo: "Cliente", valor: (r) => r.clients?.name ?? "" },
        { titulo: "Equipamento", valor: (r) => r.equipments?.name ?? "" },
        { titulo: "Disparos", valor: (r) => Number(r.shots ?? 0) },
        { titulo: "Valor", valor: (r) => Number(r.calculated_value) },
        { titulo: "Situação", valor: (r) => situacao(r).label },
        { titulo: "Pago em", valor: (r) => (r.pago_em ? formatDate(r.pago_em) : "") },
        { titulo: "Pagamento", valor: (r) => PAGAMENTOS[r.payment_method] ?? r.payment_method },
        { titulo: "Reagendada", valor: (r) => (r.rescheduled ? "sim" : "") },
      ],
      "locacoes",
      periodo.rotulo
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
          Locações realizadas
        </h1>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          O que aconteceu e quanto valeu. Para ver quem confirmou, cancelou ou apagou cada registro,
          o histórico de ações fica em{" "}
          <Link href="/movimentacoes" className="text-brand-teal underline underline-offset-2">
            Movimentações
          </Link>
          .
        </p>
      </div>

      <FiltroBarra
        periodoPadrao="mes"
        rotuloPeriodo={periodo.rotulo}
        contagem={{
          mostrando: linhas.length,
          rotulo: linhas.length === 1 ? "locação" : "locações",
        }}
        campos={[
          {
            chave: "situacao",
            rotuloVazio: "Toda situação",
            opcoes: [
              { valor: "a_receber", label: "A receber" },
              { valor: "pagas", label: "Pagas" },
              { valor: "realizadas", label: "Realizadas" },
              { valor: "canceladas", label: "Canceladas" },
            ],
          },
          {
            chave: "equipamento",
            rotuloVazio: "Todos os equipamentos",
            opcoes: equipments.map((e) => ({ valor: e.id, label: e.name })),
          },
          {
            chave: "cliente",
            rotuloVazio: "Todos os clientes",
            opcoes: clients.map((c) => ({ valor: c.id, label: c.name })),
          },
          {
            chave: "pagamento",
            rotuloVazio: "Toda forma de pagamento",
            opcoes: Object.entries(PAGAMENTOS).map(([valor, label]) => ({ valor, label })),
          },
        ]}
        buscaPlaceholder="Buscar cliente..."
        acoes={
          <button
            type="button"
            onClick={baixarCsv}
            disabled={linhas.length === 0}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            Exportar CSV
          </button>
        }
      />

      {atingiuTeto && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
          Este período tem mais locações do que a tela carrega de uma vez, então os totais estão
          incompletos. Escolha um período menor.
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Recebido</p>
          <p className="mt-0.5 text-sm font-semibold text-brand-teal sm:text-base">
            {formatCurrency(totais.recebido)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">A receber</p>
          <p className="mt-0.5 text-sm font-semibold text-amber-600 dark:text-amber-400 sm:text-base">
            {formatCurrency(totais.aReceber)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Disparos</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-700 dark:text-neutral-200 sm:text-base">
            {totais.disparos.toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Cancelado</p>
          <p className="mt-0.5 text-sm font-semibold text-neutral-400 sm:text-base">
            {formatCurrency(totais.cancelado)}
          </p>
        </div>
      </div>

      {/* Celular */}
      <div className="space-y-2 sm:hidden">
        {linhas.map((r) => {
          const s = situacao(r);
          return (
            <Link
              key={r.id}
              href={`/clientes/${r.client_id}`}
              className="block rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {r.clients?.name ?? "Cliente removido"}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {formatDate(r.event_date)} · {r.equipments?.name ?? "-"} ·{" "}
                    {Number(r.shots ?? 0).toLocaleString("pt-BR")} disparos
                  </p>
                </div>
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${s.classe}`}
                >
                  {s.label}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  {PAGAMENTOS[r.payment_method] ?? r.payment_method}
                  {r.rescheduled ? " · reagendada" : ""}
                </span>
                <span
                  className={`font-medium ${
                    r.status === "cancelada" ? "text-neutral-400 line-through" : "text-brand-teal"
                  }`}
                >
                  {formatCurrency(Number(r.calculated_value))}
                </span>
              </div>
            </Link>
          );
        })}
        {linhas.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            Nenhuma locação em {periodo.rotulo}.
          </div>
        )}
      </div>

      {/* Tablet e notebook */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55 sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Cliente</th>
              <th className="px-4 py-3">Equipamento</th>
              <th className="px-4 py-3 text-right">Disparos</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Situação</th>
              <th className="px-4 py-3">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => {
              const s = situacao(r);
              return (
                <tr
                  key={r.id}
                  className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
                >
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {formatDate(r.event_date)}
                  </td>
                  <td className="px-4 py-3 text-neutral-900 dark:text-neutral-100">
                    <Link
                      href={`/clientes/${r.client_id}`}
                      className="underline decoration-transparent underline-offset-2 transition hover:decoration-brand-teal"
                    >
                      {r.clients?.name ?? "Cliente removido"}
                    </Link>
                    {r.rescheduled && (
                      <span className="ml-1.5 text-[11px] font-normal text-neutral-400">
                        · reagendada
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {r.equipments?.name ?? "-"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-neutral-600 dark:text-neutral-400">
                    {Number(r.shots ?? 0).toLocaleString("pt-BR")}
                  </td>
                  <td
                    className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                      r.status === "cancelada" ? "text-neutral-400 line-through" : "text-brand-teal"
                    }`}
                  >
                    {formatCurrency(Number(r.calculated_value))}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.classe}`}>
                      {s.label}
                    </span>
                    {r.pago_em && (
                      <span className="ml-1.5 text-[11px] text-neutral-400">
                        {formatDate(r.pago_em)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-400">
                    {PAGAMENTOS[r.payment_method] ?? r.payment_method}
                  </td>
                </tr>
              );
            })}
            {linhas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma locação em {periodo.rotulo}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
