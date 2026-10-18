// ============================================================
// Contas dos gráficos do Dashboard (sem React, para testar).
//
// Fluxo: entradas e saídas por dia (ou por mês, em período longo) e o
// resultado acumulado ao longo do período. Categorias: soma por categoria,
// as maiores primeiro, o resto em "Outras".
// ============================================================

import { somarDias } from "./period";

export interface LancamentoGrafico {
  type: "entrada" | "saida";
  amount: number | string;
  date: string; // YYYY-MM-DD
  categories?: { name: string } | null;
}

export interface PontoFluxo {
  chave: string; // YYYY-MM-DD ou YYYY-MM
  rotulo: string; // 14/10 ou out/26
  entradas: number;
  saidas: number;
  acumulado: number; // resultado acumulado até este ponto
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];


/**
 * Pontos do período, dia a dia; acima de 62 dias, mês a mês. Dias sem
 * movimento entram com zero (o acumulado fica reto), até `ate`
 * (normalmente hoje, para a linha não seguir pelo futuro).
 */
export function montarFluxo(lancamentos: LancamentoGrafico[], inicio: string, ate: string): PontoFluxo[] {
  if (!inicio || !ate || ate < inicio) return [];
  const dias = Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${inicio}T12:00:00Z`)) / 86400000) + 1;
  const porMes = dias > 62;
  const chaveDe = (iso: string) => (porMes ? iso.slice(0, 7) : iso);

  const chaves: string[] = [];
  for (let d = inicio; d <= ate; d = somarDias(d, 1)) {
    const k = chaveDe(d);
    if (chaves[chaves.length - 1] !== k) chaves.push(k);
  }
  const mapa = new Map(chaves.map((k) => [k, { entradas: 0, saidas: 0 }]));
  for (const l of lancamentos) {
    const p = mapa.get(chaveDe(l.date));
    if (!p) continue;
    const v = Number(l.amount) || 0;
    if (l.type === "entrada") p.entradas += v;
    else p.saidas += v;
  }
  let acc = 0;
  return chaves.map((k) => {
    const p = mapa.get(k)!;
    acc += p.entradas - p.saidas;
    const rotulo = porMes ? `${MESES[Number(k.slice(5, 7)) - 1]}/${k.slice(2, 4)}` : `${k.slice(8, 10)}/${k.slice(5, 7)}`;
    return { chave: k, rotulo, entradas: round2(p.entradas), saidas: round2(p.saidas), acumulado: round2(acc) };
  });
}

export interface FatiaCategoria {
  nome: string;
  valor: number;
  pct: number;
}

/** Soma por categoria do tipo pedido; as `max` maiores, o resto em "Outras". */
export function somarPorCategoria(lancamentos: LancamentoGrafico[], tipo: "entrada" | "saida", max = 5): FatiaCategoria[] {
  const somas = new Map<string, number>();
  for (const l of lancamentos) {
    if (l.type !== tipo) continue;
    const nome = l.categories?.name ?? "Sem categoria";
    somas.set(nome, (somas.get(nome) ?? 0) + (Number(l.amount) || 0));
  }
  const total = Array.from(somas.values()).reduce((s, v) => s + v, 0);
  if (total <= 0) return [];
  const ordenadas = Array.from(somas.entries()).sort((a, b) => b[1] - a[1]);
  const top = ordenadas.slice(0, max);
  const resto = ordenadas.slice(max).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) top.push(["Outras", resto]);
  return top.map(([nome, valor]) => ({ nome, valor: round2(valor), pct: valor / total }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
