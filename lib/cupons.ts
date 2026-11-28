// Cupons de desconto (28/11/2026, pedido do dono): o desconto da calculadora
// pode levar um nome ("Cupom INDICAÇÃO", "Cupom BLACK FRIDAY") que aparece no
// resumo do WhatsApp e na imagem do cálculo, em vez de só "15% de desconto".
// O de indicação entra sozinho; os outros ficam em Configurações > Cupons.

export const CUPOM_INDICACAO = "INDICAÇÃO";
export const MAX_NOME_CUPOM = 30;
export const MAX_CUPONS = 10;

export interface Cupom {
  nome: string;
  percentual: number;
}

/** Nome do cupom em maiúsculas, sem espaço sobrando, até 30 letras. */
export function normalizarCupom(nome: string | null | undefined): string {
  return (nome ?? "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, MAX_NOME_CUPOM);
}

const pct = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Rótulo do desconto nas linhas de ajuste (resumo do WhatsApp e cálculo). */
export function rotuloDesconto(tipo: "valor" | "percentual", percentual: number, cupom?: string | null): string {
  const nome = normalizarCupom(cupom);
  if (nome) return tipo === "percentual" ? `Cupom ${nome} (${pct(percentual)}%)` : `Cupom ${nome}`;
  return tipo === "percentual" ? `${pct(percentual)}% de desconto` : "Desconto";
}

/** Para a imagem do cálculo: o nome do cupom sem o "(15%)", que vai no valor. */
export function rotuloCupomImagem(desc: string): string | null {
  if (!desc.startsWith("Cupom ")) return null;
  return desc.replace(/ \([\d.,]+%\)$/, "");
}

/** Lista de cupons gravada em Configurações: só os válidos, sem nome repetido. */
export function lerCupons(bruto: unknown, padrao: Cupom[]): Cupom[] {
  if (!Array.isArray(bruto)) return padrao;
  const saida: Cupom[] = [];
  for (const c of bruto) {
    if (!c || typeof c !== "object") continue;
    const nome = normalizarCupom((c as { nome?: unknown }).nome as string);
    const p = Number((c as { percentual?: unknown }).percentual);
    if (!nome || !(p > 0 && p <= 100) || saida.some((x) => x.nome === nome)) continue;
    saida.push({ nome, percentual: Math.round(p * 100) / 100 });
    if (saida.length >= MAX_CUPONS) break;
  }
  return saida;
}
