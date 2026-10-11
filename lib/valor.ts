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

/**
 * Lê o custo negociado por disparo, com até 4 casas.
 * Com vírgula ou ponto vale como escrito: "0,065" = 0,065.
 * Só dígitos segue o costume antigo de centavos: "9" = 0,09.
 * Devolve null quando vazio, ilegível ou zero.
 */
export function lerCustoPorDisparo(texto: string): number | null {
  const t = texto.trim().replace(/\s/g, "").replace(/^R\$/, "");
  if (!t) return null;
  const n = /[.,]/.test(t) ? Number(t.replace(",", ".")) : Number(t) / 100;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10000) / 10000;
}

/** Limpa o campo do custo por disparo: dígitos e uma vírgula, até 4 casas. */
export function limparCampoCustoPorDisparo(texto: string): string {
  const s = texto.replace(/\./g, ",").replace(/[^\d,]/g, "");
  const i = s.indexOf(",");
  if (i === -1) return s;
  return s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, "").slice(0, 4);
}
