// ============================================================
// Gráficos que acompanham cada planilha exportada. Feitos com as mesmas
// linhas da tela (o que você vê é o que vai para a planilha).
// ============================================================

import { montarFluxo, somarPorCategoria, type LancamentoGrafico } from "./grafico-fluxo";
import { COR_DESTAQUE, COR_ENTRADA, COR_SAIDA, type GraficoPlanilha } from "./planilha-graficos";

/** Soma (ou conta) por um rótulo; maiores primeiro, até `max`, resto em "Outros". */
export function rankingPor<T>(
  linhas: T[],
  rotulo: (l: T) => string | null | undefined,
  valor: (l: T) => number = () => 1,
  max = 8
): { categorias: string[]; valores: number[] } {
  const somas = new Map<string, number>();
  for (const l of linhas) {
    const k = (rotulo(l) ?? "").trim() || "Sem informação";
    somas.set(k, (somas.get(k) ?? 0) + (Number(valor(l)) || 0));
  }
  const ord = Array.from(somas.entries()).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
  const top = ord.slice(0, max);
  const resto = ord.slice(max).reduce((s, [, v]) => s + v, 0);
  if (resto) top.push(["Outros", resto]);
  return { categorias: top.map(([k]) => k), valores: top.map(([, v]) => Math.round(v * 100) / 100) };
}

export function barras(titulo: string, dados: { categorias: string[]; valores: number[] }, opc: { serie: string; cor?: string; formato?: "moeda" | "inteiro" }): GraficoPlanilha | null {
  if (dados.categorias.length === 0) return null;
  return {
    tipo: "barras",
    titulo,
    categorias: dados.categorias,
    series: [{ nome: opc.serie, valores: dados.valores, cor: opc.cor ?? COR_DESTAQUE }],
    formato: opc.formato ?? "moeda",
  };
}

/** Período coberto pelas datas (YYYY-MM-DD) das linhas. */
function extremos(datas: string[]): [string, string] | null {
  const v = datas.filter(Boolean).sort();
  return v.length ? [v[0], v[v.length - 1]] : null;
}

/** Financeiro: entradas e saídas por dia, resultado acumulado e saídas por categoria. */
export function graficosFinanceiro(lancamentos: LancamentoGrafico[]): GraficoPlanilha[] {
  const ext = extremos(lancamentos.map((l) => l.date));
  if (!ext) return [];
  const f = montarFluxo(lancamentos, ext[0], ext[1]);
  const porDia = f.length > 62 ? "por mês" : "por dia";
  const cats = somarPorCategoria(lancamentos, "saida", 7);
  const ent = somarPorCategoria(lancamentos, "entrada", 7);
  const lista: (GraficoPlanilha | null)[] = [
    {
      tipo: "colunas",
      titulo: `Entradas e saídas ${porDia}`,
      categorias: f.map((p) => p.rotulo),
      series: [
        { nome: "Entradas", valores: f.map((p) => p.entradas), cor: COR_ENTRADA },
        { nome: "Saídas", valores: f.map((p) => p.saidas), cor: COR_SAIDA },
      ],
    },
    { tipo: "area", titulo: "Resultado acumulado", categorias: f.map((p) => p.rotulo), series: [{ nome: "Resultado acumulado", valores: f.map((p) => p.acumulado), cor: "#3DBFB8" }] },
    barras("Para onde foi o dinheiro", { categorias: cats.map((c) => c.nome), valores: cats.map((c) => c.valor) }, { serie: "Saídas", cor: COR_SAIDA }),
    barras("De onde veio o dinheiro", { categorias: ent.map((c) => c.nome), valores: ent.map((c) => c.valor) }, { serie: "Entradas", cor: COR_ENTRADA }),
  ];
  return lista.filter((g): g is GraficoPlanilha => !!g);
}

/** Valor por dia (ou mês, em período longo) de uma lista com data e valor. */
export function colunasPorData<T>(
  titulo: string,
  linhas: T[],
  data: (l: T) => string | null | undefined,
  valor: (l: T) => number,
  opc: { serie: string; cor?: string; formato?: "moeda" | "inteiro" }
): GraficoPlanilha | null {
  const datas = linhas.map((l) => data(l) ?? "").filter(Boolean);
  const ext = extremos(datas);
  if (!ext) return null;
  const f = montarFluxo(
    linhas.filter((l) => data(l)).map((l) => ({ type: "entrada" as const, amount: valor(l), date: data(l)! })),
    ext[0],
    ext[1]
  );
  return {
    tipo: "colunas",
    titulo: `${titulo} ${f.length > 62 ? "por mês" : "por dia"}`,
    categorias: f.map((p) => p.rotulo),
    series: [{ nome: opc.serie, valores: f.map((p) => p.entradas), cor: opc.cor ?? COR_ENTRADA }],
    formato: opc.formato ?? "moeda",
  };
}

export function soGraficos(lista: (GraficoPlanilha | null)[]): GraficoPlanilha[] {
  return lista.filter((g): g is GraficoPlanilha => !!g);
}
