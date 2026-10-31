// Lembrete de importar a fatura do cartão (balão na tela e aviso do Dashboard).
// Vale só para o cartão que já usa importação (tem ao menos uma linha importada):
// depois do fechamento, enquanto não houver importação feita depois do dia do
// fechamento, o lembrete aparece. Regra pura, sem banco.

import { faturaDaCompra } from "./cartao";
import { hojeLocal } from "./period";

export interface CartaoParaLembrete {
  id: string;
  nome: string;
  scope: "harmonize" | "pessoal";
  dia_fechamento: number;
  dia_vencimento: number;
  /** Data e hora (timestamptz) da última linha importada; null se nunca importou. */
  ultimaImportacao: string | null;
}

export interface LembreteFatura {
  cartaoId: string;
  nome: string;
  scope: "harmonize" | "pessoal";
  /** Dia em que a fatura fechou, "AAAA-MM-DD". */
  fechamento: string;
  /** Mês do vencimento da fatura que fechou, "AAAA-MM". */
  faturaRef: string;
  diasDesdeFechamento: number;
}

function ultimoDia(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function dataDoFechamento(ano: number, mes: number, dia: number): string {
  const d = Math.min(Math.max(1, dia), ultimoDia(ano, mes));
  return `${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Último fechamento que já passou: o deste mês se hoje é depois dele, senão o do mês anterior. */
export function ultimoFechamento(hoje: string, diaFechamento: number): string {
  const [a, m] = hoje.split("-").map(Number);
  const desteMes = dataDoFechamento(a, m, diaFechamento);
  if (hoje > desteMes) return desteMes;
  return m === 1 ? dataDoFechamento(a - 1, 12, diaFechamento) : dataDoFechamento(a, m - 1, diaFechamento);
}

function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`);
  return Math.round(ms / 86400000);
}

export function lembretesDeFatura(hoje: string, cartoes: CartaoParaLembrete[]): LembreteFatura[] {
  const lista: LembreteFatura[] = [];
  for (const c of cartoes) {
    if (!c.ultimaImportacao) continue; // cartão que não usa importação nunca avisa
    if (!c.dia_fechamento || !c.dia_vencimento) continue;
    const fechamento = ultimoFechamento(hoje, c.dia_fechamento);
    const diaImportacao = hojeLocal(new Date(c.ultimaImportacao));
    if (diaImportacao > fechamento) continue; // já importou depois do fechamento
    lista.push({
      cartaoId: c.id,
      nome: c.nome,
      scope: c.scope,
      fechamento,
      faturaRef: faturaDaCompra(fechamento, c.dia_fechamento, c.dia_vencimento),
      diasDesdeFechamento: diasEntre(fechamento, hoje),
    });
  }
  return lista.sort((a, b) => b.diasDesdeFechamento - a.diasDesdeFechamento || a.nome.localeCompare(b.nome));
}

/** Endereço que abre a tela Cartões do espaço certo, no cartão, com a importação já aberta. */
export function linkImportarFatura(l: Pick<LembreteFatura, "cartaoId" | "scope" | "faturaRef">): string {
  const base = l.scope === "pessoal" ? "/pessoal/cartoes" : "/financeiro/cartoes";
  return `${base}?cartao=${l.cartaoId}&fatura=${l.faturaRef}&importar=1`;
}

/** "2026-11-25" vira "25/11". */
export function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}
