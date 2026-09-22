"use client";

import { useMemo, useState } from "react";

interface Movimentacao {
  id: string;
  ocorrido_em: string;
  usuario_nome: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  descricao: string;
  detalhes: Record<string, any> | null;
}

const ACAO_META: Record<string, { label: string; classe: string }> = {
  criado: { label: "Criado", classe: "bg-brand-teal/10 text-brand-teal" },
  editado: { label: "Editado", classe: "bg-brand-blue/10 text-brand-blue" },
  confirmado: { label: "Confirmado", classe: "bg-brand-teal/10 text-brand-teal" },
  desconfirmado: { label: "Desconfirmado", classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  reagendado: { label: "Reagendado", classe: "bg-brand-blue/10 text-brand-blue" },
  cancelado: { label: "Cancelado", classe: "bg-brand-pink/10 text-brand-pink" },
  excluido: { label: "Excluído", classe: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

const ENTIDADE_LABEL: Record<string, string> = {
  rentals: "Locação",
  transactions: "Financeiro",
  calendar_events: "Agenda",
  clients: "Cliente",
  tasks: "Tarefa",
  mentoring_events: "Mentoria",
};

function formatarDataHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Transforma o jsonb de detalhes numa frase. Cada tipo de movimentação
// guarda campos diferentes, e é justamente esse conteúdo que responde o
// "de quando para quando" que o pedido exige no reagendamento.
function descreverDetalhes(m: Movimentacao): string | null {
  const d = m.detalhes;
  if (!d) return null;

  if (d.data_antiga && d.data_nova) {
    return `De ${d.data_antiga} para ${d.data_nova}`;
  }
  if (d.status_antigo && d.status_novo) {
    return `Status: ${d.status_antigo} → ${d.status_novo}`;
  }
  if (d.valor_antigo !== undefined && d.valor_novo !== undefined) {
    return `Valor: ${d.valor_antigo} → ${d.valor_novo}`;
  }
  if (Array.isArray(d.itens) && d.itens.length > 0) {
    return `Levou junto: ${d.itens.join(", ")}`;
  }
  return null;
}

export default function MovimentacoesClient({ initialRows }: { initialRows: Movimentacao[] }) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [acao, setAcao] = useState("");
  const [entidade, setEntidade] = useState("");
  const [busca, setBusca] = useState("");

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return initialRows.filter((m) => {
      // O campo de data do filtro é uma data pura (YYYY-MM-DD) e o
      // ocorrido_em tem hora. Comparar os dez primeiros caracteres
      // resolve sem precisar montar fuso horário na mão.
      const dia = m.ocorrido_em.slice(0, 10);
      if (de && dia < de) return false;
      if (ate && dia > ate) return false;
      if (acao && m.acao !== acao) return false;
      if (entidade && m.entidade !== entidade) return false;
      if (termo) {
        const alvo = `${m.descricao} ${m.usuario_nome}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
  }, [initialRows, de, ate, acao, entidade, busca]);

  function limparFiltros() {
    setDe("");
    setAte("");
    setAcao("");
    setEntidade("");
    setBusca("");
  }

  const temFiltro = !!(de || ate || acao || entidade || busca);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Movimentações</h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          Tudo que foi criado, editado, confirmado, reagendado, cancelado ou excluído, com data, hora e autor.
          Este histórico não pode ser editado nem apagado por ninguém.
        </p>
      </div>

      <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">De</label>
            <input
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Até</label>
            <input
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Ação</label>
            <select
              value={acao}
              onChange={(e) => setAcao(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Todas</option>
              {Object.entries(ACAO_META).map(([valor, meta]) => (
                <option key={valor} value={valor}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Módulo</label>
            <select
              value={entidade}
              onChange={(e) => setEntidade(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Todos</option>
              {Object.entries(ENTIDADE_LABEL).map(([valor, label]) => (
                <option key={valor} value={valor}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Buscar</label>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cliente, valor, usuário..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {filtradas.length} de {initialRows.length}
            {filtradas.length === 1 ? " movimentação" : " movimentações"}
          </p>
          {temFiltro && (
            <button
              onClick={limparFiltros}
              className="text-xs font-medium text-brand-teal underline underline-offset-2"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {filtradas.map((m) => {
          const meta = ACAO_META[m.acao] ?? { label: m.acao, classe: "bg-neutral-100 text-neutral-600" };
          const detalhe = descreverDetalhes(m);
          return (
            <div
              key={m.id}
              className="rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.classe}`}>
                  {meta.label}
                </span>
                <span className="text-xs text-neutral-400">
                  {ENTIDADE_LABEL[m.entidade] ?? m.entidade}
                </span>
                <span className="ml-auto text-xs text-neutral-400">{formatarDataHora(m.ocorrido_em)}</span>
              </div>

              <p className="mt-1.5 text-sm text-neutral-900 dark:text-neutral-100">{m.descricao}</p>

              {detalhe && (
                <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{detalhe}</p>
              )}

              <p className="mt-1 text-xs text-neutral-400">por {m.usuario_nome}</p>
            </div>
          );
        })}

        {filtradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-12 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            {initialRows.length === 0
              ? "Nenhuma movimentação registrada ainda. A partir de agora, toda exclusão, reagendamento e mudança de status aparece aqui."
              : "Nenhuma movimentação bate com esses filtros."}
          </div>
        )}
      </div>
    </div>
  );
}q
