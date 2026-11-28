// Acertar junto o que ficou pendente (28/11/2026, pedido do dono): às vezes uma
// locação fica em aberto de propósito e é acertada na seguinte. A calculadora
// mostra as locações anteriores da cliente com saldo, e, marcado "Cobrar
// junto", soma no total, no resumo do WhatsApp e na imagem do cálculo. Os
// pagamentos cobrem primeiro a locação de agora; o que passar vai para as
// anteriores, da mais antiga para a mais nova.

export interface PendenciaAnterior {
  rentalId: string;
  /** Data do atendimento (AAAA-MM-DD). */
  data: string;
  saldo: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function totalPendencias(lista: readonly PendenciaAnterior[]): number {
  return r2(lista.reduce((s, p) => s + (p.saldo > 0 ? p.saldo : 0), 0));
}

/** Mais antiga primeiro (é a ordem de quitar). */
export function ordenarPendencias(lista: readonly PendenciaAnterior[]): PendenciaAnterior[] {
  return [...lista].filter((p) => p.saldo > 0.009).sort((a, b) => a.data.localeCompare(b.data) || a.rentalId.localeCompare(b.rentalId));
}

/**
 * Separa as linhas de pagamento em dinheiro: até `limite` ficam para a locação
 * de agora (na mesma ordem, a que passar é cortada); o resto vira linhas de
 * sobra com a mesma forma, conta e data.
 */
export function separarPagamentos<T extends { valor: number }>(linhas: readonly T[], limite: number): { atual: T[]; sobra: T[] } {
  let falta = r2(Math.max(0, limite));
  const atual: T[] = [];
  const sobra: T[] = [];
  for (const l of linhas) {
    if (!(l.valor > 0)) continue;
    const vai = r2(Math.min(falta, l.valor));
    if (vai > 0) atual.push({ ...l, valor: vai });
    falta = r2(falta - vai);
    const resto = r2(l.valor - vai);
    if (resto > 0) sobra.push({ ...l, valor: resto });
  }
  return { atual, sobra };
}

/**
 * Distribui as linhas de sobra nas pendências, da mais antiga para a mais nova.
 * O que passar do total pendente fica em `naoUsado` (a tela não deixa chegar aqui).
 */
export function distribuirNasPendencias<T extends { valor: number }>(
  sobra: readonly T[],
  pendencias: readonly PendenciaAnterior[]
): { pagamentos: { rentalId: string; linha: T }[]; naoUsado: number } {
  const fila = ordenarPendencias(pendencias).map((p) => ({ ...p, falta: r2(p.saldo) }));
  const pagamentos: { rentalId: string; linha: T }[] = [];
  let naoUsado = 0;
  for (const l of sobra) {
    let resto = r2(l.valor);
    for (const p of fila) {
      if (resto <= 0) break;
      if (p.falta <= 0) continue;
      const vai = r2(Math.min(resto, p.falta));
      pagamentos.push({ rentalId: p.rentalId, linha: { ...l, valor: vai } });
      p.falta = r2(p.falta - vai);
      resto = r2(resto - vai);
    }
    naoUsado = r2(naoUsado + resto);
  }
  return { pagamentos, naoUsado };
}
