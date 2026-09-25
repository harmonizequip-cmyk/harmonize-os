"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OPCOES_PERIODO } from "@/lib/period";

// ============================================================
// BARRA DE FILTROS
//
// POR QUE O ESTADO FICA NA URL, E NÃO NO COMPONENTE
//
// Com o filtro na URL, a página é um server component que lê searchParams
// e consulta o banco já filtrado: a tela nunca baixa mil linhas para
// esconder novecentas no navegador. De lambuja, o link fica
// compartilhável, o botão voltar funciona e recarregar não perde o
// filtro. Se o estado morasse aqui dentro, cada tela precisaria de um
// caminho próprio para chegar aos dados.
//
// POR QUE O PERÍODO É OBRIGATÓRIO
//
// Não existe opção "todos". Tela sem período fica ilegível conforme os
// dados crescem, e total sem recorte de tempo não quer dizer nada: a
// pergunta nunca é "quanto entrou desde sempre", é "quanto entrou neste
// mês". O padrão de cada tela é declarado por ela, porque "hoje" serve
// para a Agenda e não serve para o Financeiro.
// ============================================================

export interface CampoFiltro {
  /** Nome do parâmetro na URL. */
  chave: string;
  /** Rótulo da opção vazia, ex: "Todos os status". */
  rotuloVazio: string;
  opcoes: { valor: string; label: string }[];
}

export default function FiltroBarra({
  campos = [],
  buscaPlaceholder,
  periodoPadrao = "mes",
  rotuloPeriodo,
  contagem,
  acoes,
}: {
  campos?: CampoFiltro[];
  /** Quando presente, mostra o campo de busca textual (parâmetro "q"). */
  buscaPlaceholder?: string;
  periodoPadrao?: string;
  /** O intervalo já resolvido pelo servidor, escrito por extenso. */
  rotuloPeriodo?: string;
  /** Quantas linhas o filtro deixou passar, para dar retorno imediato. */
  contagem?: { mostrando: number; rotulo: string };
  /** Canto direito da barra: é onde a tela põe o botão de exportar. */
  acoes?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const periodoAtual = searchParams.get("period") ?? periodoPadrao;
  const [de, setDe] = useState(searchParams.get("from") ?? "");
  const [ate, setAte] = useState(searchParams.get("to") ?? "");

  // Busca com espera: sem isso cada tecla digitada viraria uma navegação
  // e uma consulta ao banco.
  const [busca, setBusca] = useState(searchParams.get("q") ?? "");
  const buscaNaUrl = searchParams.get("q") ?? "";
  const primeiraRenderizacao = useRef(true);

  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    if (busca === buscaNaUrl) return;
    const timer = setTimeout(() => aplicar({ q: busca || null }), 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  function aplicar(mudancas: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor === null || valor === "") params.delete(chave);
      else params.set(chave, valor);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function trocarPeriodo(chave: string) {
    // Sair do personalizado leva as datas embora, senão elas ficariam na
    // URL contradizendo o botão que está marcado.
    if (chave === "personalizado") {
      aplicar({ period: chave });
    } else {
      aplicar({ period: chave, from: null, to: null });
    }
  }

  function aplicarPersonalizado() {
    if (!de || !ate) return;
    aplicar({ period: "personalizado", from: de, to: ate });
  }

  const filtrosExtras = campos.filter((c) => searchParams.get(c.chave));
  const temFiltroExtra = filtrosExtras.length > 0 || buscaNaUrl !== "";

  function limpar() {
    const mudancas: Record<string, string | null> = { q: null };
    for (const c of campos) mudancas[c.chave] = null;
    setBusca("");
    aplicar(mudancas);
  }

  return (
    <div className="mb-4 space-y-2.5 rounded-2xl border border-neutral-200 bg-white/60 p-3 dark:border-neutral-700 dark:bg-neutral-900/40">
      <div className="flex flex-wrap items-center gap-2">
        {OPCOES_PERIODO.map((opt) => (
          <button
            key={opt.chave}
            type="button"
            onClick={() => trocarPeriodo(opt.chave)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              periodoAtual === opt.chave
                ? "bg-brand-teal text-white"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
          >
            {opt.label}
          </button>
        ))}
        {acoes && <div className="ml-auto flex items-center gap-2">{acoes}</div>}
      </div>

      {periodoAtual === "personalizado" && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <span className="text-xs text-neutral-400">até</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          <button
            type="button"
            onClick={aplicarPersonalizado}
            className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white"
          >
            Aplicar
          </button>
        </div>
      )}

      {(campos.length > 0 || buscaPlaceholder) && (
        <div className="flex flex-wrap items-center gap-2">
          {campos.map((campo) => (
            <select
              key={campo.chave}
              value={searchParams.get(campo.chave) ?? ""}
              onChange={(e) => aplicar({ [campo.chave]: e.target.value || null })}
              className={`rounded-lg border px-2 py-1.5 text-xs dark:bg-neutral-800 dark:text-neutral-100 ${
                searchParams.get(campo.chave)
                  ? "border-brand-teal text-brand-teal dark:border-brand-teal"
                  : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              }`}
            >
              <option value="">{campo.rotuloVazio}</option>
              {campo.opcoes.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.label}
                </option>
              ))}
            </select>
          ))}

          {buscaPlaceholder && (
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={buscaPlaceholder}
              className="min-w-[10rem] flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          )}

          {temFiltroExtra && (
            <button
              type="button"
              onClick={limpar}
              className="text-xs text-neutral-500 underline underline-offset-2 dark:text-neutral-400"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* A linha de baixo é o que evita a dúvida mais comum diante de uma
          tela com poucos resultados: está vazio ou está filtrado? */}
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
        {rotuloPeriodo && <span>Período: {rotuloPeriodo}</span>}
        {contagem && (
          <span>
            {rotuloPeriodo ? " · " : ""}
            {contagem.mostrando} {contagem.rotulo}
          </span>
        )}
        {temFiltroExtra && <span> · filtro aplicado</span>}
      </p>
    </div>
  );
}
