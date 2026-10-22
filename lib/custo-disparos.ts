// Custo dos disparos do planejamento: quantidade de disparos de cada área vezes o
// valor por disparo (0,12, 0,10 ou 0,07 nos exemplos do dono, ou outro valor digitado).
// A tela de custos pode simular outras quantidades por área; "aplicar" reescreve as
// linhas da área em proporção (escalarArea).

import { AREAS_FIXAS, todasAreas, totalArea, type Area, type Linha, type Plano } from "./planejador";

export const TAXAS_PADRAO = [0.12, 0.1, 0.07];

export interface AreaCusto {
  id: string;
  nome: string;
  disparos: number;
}

const arredonda2 = (n: number) => Math.round(n * 100) / 100;

/** Áreas com disparos no planejamento, na ordem da tela. */
export function areasParaCusto(p: Plano): AreaCusto[] {
  return todasAreas(p)
    .map((a) => ({ id: a.id, nome: a.nome, disparos: totalArea(p, a) }))
    .filter((a) => a.disparos > 0);
}

/** Custo = disparos x valor por disparo, em reais com centavos. */
export function custoDisparos(disparos: number, taxa: number): number {
  if (!Number.isFinite(disparos) || !Number.isFinite(taxa) || disparos <= 0 || taxa <= 0) return 0;
  return arredonda2(disparos * taxa);
}

/** "0,12", "0.1" ou "0,075" viram número; vazio ou inválido vira 0. */
export function lerTaxa(texto: string): number {
  const n = Number(texto.trim().replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

const aoDez = (n: number) => Math.max(0, Math.round(n / 10) * 10);

function multiplicador(a: Area, l: Linha) {
  return a.regiao === "corporal" ? Math.max(1, l.quad ?? 1) : 1;
}

/**
 * Leva o total de uma área para `novoTotal`, mantendo a proporção entre as linhas e os lados
 * (valores em múltiplos de 10; a diferença do arredondamento vai para a maior célula, menos no
 * corporal, onde os disparos são por quadrante). Área sem disparos: o total entra na primeira linha.
 */
export function escalarArea(p: Plano, a: Area, novoTotal: number): Linha[] {
  const linhas = (p.DATA[a.id] ?? []).map((l) => ({ ...l }));
  const alvo = Math.max(0, Math.round(novoTotal));
  const total = linhas.reduce((t, l) => t + (a.bilateral ? (l.dispD ?? 0) + (l.dispE ?? 0) : l.disp ?? 0) * multiplicador(a, l), 0);
  if (!linhas.length) return linhas;
  if (total <= 0) {
    const l = linhas[0];
    const m = multiplicador(a, l);
    if (a.bilateral) {
      const lado = aoDez(alvo / m / 2);
      l.dispD = lado;
      l.dispE = lado;
    } else {
      l.disp = aoDez(alvo / m);
    }
    return linhas;
  }
  const f = alvo / total;
  for (const l of linhas) {
    if (a.bilateral) {
      l.dispD = aoDez((l.dispD ?? 0) * f);
      l.dispE = aoDez((l.dispE ?? 0) * f);
    } else {
      l.disp = aoDez((l.disp ?? 0) * f);
    }
  }
  if (a.regiao !== "corporal") {
    const soma = linhas.reduce((t, l) => t + (a.bilateral ? (l.dispD ?? 0) + (l.dispE ?? 0) : l.disp ?? 0), 0);
    let dif = alvo - soma;
    if (dif !== 0) {
      type Celula = { l: Linha; k: "dispD" | "dispE" | "disp" };
      const celulas: Celula[] = linhas.flatMap((l): Celula[] => (a.bilateral ? [{ l, k: "dispD" }, { l, k: "dispE" }] : [{ l, k: "disp" }]));
      celulas.sort((x, y) => (y.l[y.k] ?? 0) - (x.l[x.k] ?? 0));
      const c = celulas[0];
      const novo = Math.max(0, (c.l[c.k] ?? 0) + dif);
      dif -= novo - (c.l[c.k] ?? 0);
      c.l[c.k] = novo;
    }
  }
  return linhas;
}

/** Plano com as quantidades por área trocadas (só as que mudaram). */
export function aplicarQuantidades(p: Plano, quantidades: Record<string, number>): Plano {
  const DATA = { ...p.DATA };
  for (const a of [...AREAS_FIXAS, ...p.customAreas]) {
    const q = quantidades[a.id];
    if (q === undefined || q === totalArea(p, a)) continue;
    DATA[a.id] = escalarArea(p, a, q);
  }
  return { ...p, DATA };
}
