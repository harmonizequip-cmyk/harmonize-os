"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Periodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import { exportarCsv } from "@/lib/exportar-csv";
import NovoLancamentoModal from "./NovoLancamentoModal";
import EditarLancamentoModal from "./EditarLancamentoModal";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

interface TransactionRow {
  id: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  payment_method: string;
  date: string;
  category_id: string | null;
  client_id: string | null;
  categories?: { name: string } | null;
  clients?: { name: string } | null;
  // Lançamento criado com o modo teste ligado. Continua aparecendo aqui
  // de propósito (é onde se confere o que foi lançado), mas fica
  // marcado, porque um número que não bate com o relatório sem
  // explicação visível é pior do que o número estar errado.
  is_test?: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

interface ClientOption {
  id: string;
  name: string;
}

export default function FinanceiroClient({
  initialTransactions,
  categories,
  clients,
  periodo,
  atingiuTeto,
}: {
  initialTransactions: TransactionRow[];
  categories: CategoryRow[];
  clients: ClientOption[];
  periodo: Periodo;
  atingiuTeto: boolean;
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);

  // A filtragem inteira mora na consulta do servidor agora, então o que
  // chega aqui já é o conjunto final. Os totais saem dessas mesmas
  // linhas, de propósito: total calculado por outro caminho é como o
  // faturamento passou a divergir em R$ 39.581,97.
  const totais = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const t of initialTransactions) {
      if (t.type === "entrada") entradas += Number(t.amount);
      else saidas += Number(t.amount);
    }
    return { entradas, saidas, resultado: entradas - saidas };
  }, [initialTransactions]);

  function baixarCsv() {
    exportarCsv(
      initialTransactions,
      [
        { titulo: "Data", valor: (t) => formatDate(t.date) },
        { titulo: "Tipo", valor: (t) => (t.type === "entrada" ? "Entrada" : "Saída") },
        { titulo: "Categoria", valor: (t) => t.categories?.name ?? "" },
        { titulo: "Descrição", valor: (t) => t.description },
        { titulo: "Cliente", valor: (t) => t.clients?.name ?? "" },
        { titulo: "Valor", valor: (t) => Number(t.amount) },
        { titulo: "Pagamento", valor: (t) => PAYMENT_LABELS[t.payment_method] ?? t.payment_method },
        { titulo: "Teste", valor: (t) => (t.is_test ? "sim" : "") },
      ],
      "financeiro",
      periodo.rotulo
    );
  }

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Financeiro</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
        >
          + Novo lançamento
        </button>
      </div>

      <FiltroBarra
        periodoPadrao="mes"
        rotuloPeriodo={periodo.rotulo}
        contagem={{
          mostrando: initialTransactions.length,
          rotulo: initialTransactions.length === 1 ? "lançamento" : "lançamentos",
        }}
        campos={[
          {
            chave: "tipo",
            rotuloVazio: "Entradas e saídas",
            opcoes: [
              { valor: "entrada", label: "Só entradas" },
              { valor: "saida", label: "Só saídas" },
            ],
          },
          {
            chave: "categoria",
            rotuloVazio: "Todas as categorias",
            opcoes: categories.map((c) => ({
              valor: c.id,
              label: `${c.name} (${c.type === "entrada" ? "entrada" : "saída"})`,
            })),
          },
          {
            chave: "pagamento",
            rotuloVazio: "Toda forma de pagamento",
            opcoes: Object.entries(PAYMENT_LABELS).map(([valor, label]) => ({ valor, label })),
          },
          {
            chave: "cliente",
            rotuloVazio: "Todos os clientes",
            opcoes: clients.map((c) => ({ valor: c.id, label: c.name })),
          },
        ]}
        buscaPlaceholder="Buscar na descrição..."
        acoes={
          <button
            type="button"
            onClick={baixarCsv}
            disabled={initialTransactions.length === 0}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            Exportar CSV
          </button>
        }
      />

      {atingiuTeto && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
          Este período tem mais lançamentos do que a tela carrega de uma vez, então os totais abaixo
          estão incompletos. Escolha um período menor.
        </div>
      )}

      {/* Os totais são do que está filtrado, não do mês inteiro nem de
          sempre. Dizer isso na tela evita ler "Resultado" como o caixa
          da empresa quando há um filtro de categoria ligado. */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Entradas</p>
          <p className="mt-0.5 text-sm font-semibold text-brand-teal sm:text-base">
            {formatCurrency(totais.entradas)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Saídas</p>
          <p className="mt-0.5 text-sm font-semibold text-brand-pink sm:text-base">
            {formatCurrency(totais.saidas)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Resultado</p>
          <p
            className={`mt-0.5 text-sm font-semibold sm:text-base ${
              totais.resultado >= 0 ? "text-brand-teal" : "text-brand-pink"
            }`}
          >
            {formatCurrency(totais.resultado)}
          </p>
        </div>
      </div>

      {/* Celular: lista de cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {initialTransactions.map((t) => (
          <div
            key={t.id}
            onClick={() => setEditing(t)}
            className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {t.description}
                  {t.is_test && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      TESTE
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {formatDate(t.date)} · {t.categories?.name ?? "-"}
                  {t.clients?.name ? ` · ${t.clients.name}` : ""}
                </p>
              </div>
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                  t.type === "entrada" ? "bg-brand-teal/10 text-brand-teal" : "bg-brand-pink/10 text-brand-pink"
                }`}
              >
                {t.type === "entrada" ? "Entrada" : "Saída"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500 dark:text-neutral-400">{PAYMENT_LABELS[t.payment_method] ?? t.payment_method}</span>
              <span
                className={`font-medium ${t.type === "entrada" ? "text-brand-teal" : "text-brand-pink"}`}
              >
                {formatCurrency(Number(t.amount))}
              </span>
            </div>
          </div>
        ))}
        {initialTransactions.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            Nenhum lançamento em {periodo.rotulo}.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55 sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {initialTransactions.map((t) => (
              <tr
                key={t.id}
                onClick={() => setEditing(t)}
                className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-400">{formatDate(t.date)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.type === "entrada" ? "bg-brand-teal/10 text-brand-teal" : "bg-brand-pink/10 text-brand-pink"
                    }`}
                  >
                    {t.type === "entrada" ? "Entrada" : "Saída"}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600 dark:text-neutral-400">{t.categories?.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-900 dark:text-neutral-100">
                  {t.description}
                  {t.is_test && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                      TESTE
                    </span>
                  )}
                  {t.clients?.name && (
                    <span className="ml-1 text-xs font-normal text-neutral-400">· {t.clients.name}</span>
                  )}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                    t.type === "entrada" ? "text-brand-teal" : "text-brand-pink"
                  }`}
                >
                  {formatCurrency(Number(t.amount))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600 dark:text-neutral-400">
                  {PAYMENT_LABELS[t.payment_method] ?? t.payment_method}
                </td>
              </tr>
            ))}
            {initialTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum lançamento em {periodo.rotulo}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <NovoLancamentoModal
          categories={categories}
          clients={clients}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editing && (
        <EditarLancamentoModal
          transaction={editing}
          categories={categories}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onDeleted={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
