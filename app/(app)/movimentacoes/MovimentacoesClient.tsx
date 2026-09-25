"use client";

import Link from "next/link";
import type { Periodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import { exportarCsv } from "@/lib/exportar-csv";
import { ACAO_META, ENTIDADE_LABEL, formatarDataHora, descreverDetalhes, type Movimentacao } from "@/lib/movimentacoes";

export default function MovimentacoesClient({
  initialRows,
  periodo,
  atingiuTeto,
}: {
  initialRows: Movimentacao[];
  periodo: Periodo;
  atingiuTeto: boolean;
}) {
  // A filtragem mora toda na consulta do servidor agora. Antes ela
  // peneirava no navegador em cima das últimas 500 linhas, e este
  // histórico só cresce: com o tempo, o começo do período sumiria da
  // tela sem nada avisando.
  const filtradas = initialRows;

  function baixarCsv() {
    exportarCsv(
      filtradas,
      [
        { titulo: "Quando", valor: (m) => formatarDataHora(m.ocorrido_em) },
        { titulo: "Ação", valor: (m) => ACAO_META[m.acao]?.label ?? m.acao },
        { titulo: "Módulo", valor: (m) => ENTIDADE_LABEL[m.entidade] ?? m.entidade },
        { titulo: "Descrição", valor: (m) => m.descricao },
        { titulo: "Detalhe", valor: (m) => descreverDetalhes(m) ?? "" },
        { titulo: "Autor", valor: (m) => m.usuario_nome },
      ],
      "movimentacoes",
      periodo.rotulo
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Movimentações</h1>
        <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
          Tudo que foi criado, editado, confirmado, reagendado, cancelado ou excluído, com data, hora e autor.
          Este histórico não pode ser editado nem apagado por ninguém. Para ver o que aconteceu e
          quanto valeu, o histórico de{" "}
          <Link href="/locacoes" className="text-brand-teal underline underline-offset-2">
            Locações
          </Link>{" "}
          é a tela ao lado.
        </p>
      </div>

      <FiltroBarra
        periodoPadrao="mes"
        rotuloPeriodo={periodo.rotulo}
        contagem={{
          mostrando: filtradas.length,
          rotulo: filtradas.length === 1 ? "movimentação" : "movimentações",
        }}
        campos={[
          {
            chave: "acao",
            rotuloVazio: "Todas as ações",
            opcoes: Object.entries(ACAO_META).map(([valor, meta]) => ({
              valor,
              label: meta.label,
            })),
          },
          {
            chave: "entidade",
            rotuloVazio: "Todos os módulos",
            opcoes: Object.entries(ENTIDADE_LABEL).map(([valor, label]) => ({ valor, label })),
          },
        ]}
        buscaPlaceholder="Buscar na descrição..."
        acoes={
          <button
            type="button"
            onClick={baixarCsv}
            disabled={filtradas.length === 0}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            Exportar CSV
          </button>
        }
      />

      {atingiuTeto && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-300">
          Este período tem mais movimentações do que a tela carrega de uma vez. Escolha um período
          menor para ver o começo dele.
        </div>
      )}

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
            Nenhuma movimentação em {periodo.rotulo}. Experimente um período maior, ou limpe os
            filtros.
          </div>
        )}
      </div>
    </div>
  );
}
