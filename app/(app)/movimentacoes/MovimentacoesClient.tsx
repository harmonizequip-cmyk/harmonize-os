"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import HeroTela from "@/components/ui/HeroTela";
import type { Periodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import { exportarTabela } from "@/lib/exportar-planilha";
import { barras, rankingPor, soGraficos } from "@/lib/graficos-exportacao";
import { linkDaMovimentacao } from "@/lib/atalhos";
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
    exportarTabela(
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
      periodo.rotulo,
      {
        titulo: "Movimentações",
        graficos: soGraficos([
          barras("O que foi feito", rankingPor(filtradas, (m) => ACAO_META[m.acao]?.label ?? m.acao), { serie: "Quantidade", formato: "inteiro" }),
          barras("Em qual parte do sistema", rankingPor(filtradas, (m) => ENTIDADE_LABEL[m.entidade] ?? m.entidade), { serie: "Quantidade", formato: "inteiro", cor: "#3E8FC9" }),
        ]),
      }
    );
  }

  return (
    <div className="space-y-4">
      <HeroTela
        etiqueta={`Movimentações · ${periodo.rotulo}`}
        rotulo="Registros no período"
        valor={filtradas.length.toLocaleString("pt-BR")}
        apoio="Tudo que foi criado, editado, confirmado, reagendado, cancelado ou excluído, com data, hora e autor. Ninguém edita nem apaga este histórico."
        chips={[{ texto: "Só leitura", icone: ShieldCheck }]}
      />
      <p className="px-1 text-xs text-neutral-500">
        Para ver o que aconteceu e quanto valeu, o histórico de{" "}
        <Link href="/locacoes" className="text-brand-teal underline underline-offset-2">
          Locações
        </Link>{" "}
        é a tela ao lado.
      </p>

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
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50"
          >
            Exportar planilha
          </button>
        }
      />

      {atingiuTeto && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Este período tem mais movimentações do que a tela carrega de uma vez. Escolha um período
          menor para ver o começo dele.
        </div>
      )}

      <div className="space-y-2">
        {filtradas.map((m) => {
          const meta = ACAO_META[m.acao] ?? { label: m.acao, classe: "bg-neutral-100 text-neutral-600" };
          const detalhe = descreverDetalhes(m);
          // Toque abre o item ligado; o que foi excluído fica sem link.
          const href =
            m.acao === "excluido"
              ? null
              : linkDaMovimentacao(m.entidade, m.entidade_id, { client_id: m.detalhes?.client_id ?? null });
          const classe = "block rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl";
          const conteudo = (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.classe}`}>
                  {meta.label}
                </span>
                <span className="text-xs text-neutral-400">
                  {ENTIDADE_LABEL[m.entidade] ?? m.entidade}
                </span>
                <span className="ml-auto text-xs text-neutral-400">{formatarDataHora(m.ocorrido_em)}</span>
              </div>

              <p className="mt-1.5 text-sm text-neutral-900">{m.descricao}</p>

              {detalhe && (
                <p className="mt-0.5 text-xs text-neutral-500">{detalhe}</p>
              )}

              <p className="mt-1 text-xs text-neutral-400">
                por {m.usuario_nome}
                {href && <span className="ml-2 text-brand-teal-dark">abrir ›</span>}
              </p>
            </>
          );
          return href ? (
            <Link key={m.id} href={href} className={`${classe} hover:border-brand-teal`}>
              {conteudo}
            </Link>
          ) : (
            <div key={m.id} className={classe}>
              {conteudo}
            </div>
          );
        })}

        {filtradas.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-12 text-center text-neutral-400 backdrop-blur-xl">
            Nenhuma movimentação em {periodo.rotulo}. Experimente um período maior, ou limpe os
            filtros.
          </div>
        )}
      </div>
    </div>
  );
}
