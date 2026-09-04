"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency, formatDate } from "@/lib/format";
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
}: {
  initialTransactions: TransactionRow[];
  categories: CategoryRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);
  const [typeFilter, setTypeFilter] = useState<"todos" | "entrada" | "saida">("todos");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return initialTransactions.filter((t) => {
      if (typeFilter !== "todos" && t.type !== typeFilter) return false;
      if (search && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [initialTransactions, typeFilter, search]);

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

      <div className="flex flex-wrap items-center gap-2">
        {(["todos", "entrada", "saida"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              typeFilter === key ? "bg-brand-teal text-white" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            }`}
          >
            {key === "todos" ? "Todos" : key === "entrada" ? "Entradas" : "Saídas"}
          </button>
        ))}
        <input
          placeholder="Buscar descrição..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto rounded-full border border-neutral-200 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-teal"
        />
      </div>

      {/* Celular: lista de cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {filtered.map((t) => (
          <div
            key={t.id}
            onClick={() => setEditing(t)}
            className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{t.description}</p>
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
        {filtered.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            Nenhum lançamento encontrado.
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
            {filtered.map((t) => (
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
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum lançamento encontrado.
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
