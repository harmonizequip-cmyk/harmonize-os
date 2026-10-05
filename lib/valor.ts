/**
 * Converte o texto de um campo de valor em reais para número.
 * Aceita "1.500,50", "1500,50", "1500.50", "1.500" (milhar) e "150".
 * Devolve NaN quando não dá para ler.
 */
export function valorParaNumero(texto: string): number {
  const t = texto.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (!t) return NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

/** Número para o campo de valor: 1234.5 vira "1234,50". */
export function numeroParaCampo(n: number): string {
  return n.toFixed(2).replace(".", ",");
}
