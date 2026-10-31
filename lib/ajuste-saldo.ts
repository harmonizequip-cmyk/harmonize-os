// Ajuste de saldo (31/10/2026): quando o saldo do app difere do saldo real do
// banco, a função ajustar_saldo lança a diferença na categoria de sistema
// "Ajuste de saldo" (entrada ou saída). Esse lançamento mexe só no saldo:
// fica fora de Entradas, Saídas, Resultado, gráficos e relatórios por categoria,
// como o empréstimo, mas não é empréstimo (não aparece na tela Empréstimos nem
// no "Tudo que saiu da conta").

import { ehCategoriaDeEmprestimo } from "./emprestimos";
import { foraDoSaldo, type CartaoMov } from "./cartao";
import { valorParaNumero } from "./valor";

export const CATEGORIA_AJUSTE_SALDO = "Ajuste de saldo";

export function ehAjusteDeSaldo(nome: string | null | undefined): boolean {
  return !!nome && nome.trim().toLowerCase() === CATEGORIA_AJUSTE_SALDO.toLowerCase();
}

/**
 * Categoria que mexe no caixa mas não é receita nem despesa: empréstimo,
 * devolução de empréstimo e ajuste de saldo. Use nas somas de resultado.
 */
export function ehForaDoResultado(nome: string | null | undefined): boolean {
  return ehCategoriaDeEmprestimo(nome) || ehAjusteDeSaldo(nome);
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Saldo de sempre: tudo que entrou menos tudo que saiu, fora compra no cartão e permuta. */
export function somarSaldo(
  linhas: { type: string; amount: number | string; cartao_mov?: CartaoMov; payment_method?: string | null }[]
): number {
  return r2(
    linhas.filter((t) => !foraDoSaldo(t)).reduce((s, t) => s + (t.type === "entrada" ? 1 : -1) * Number(t.amount), 0)
  );
}

/**
 * Lê o saldo digitado: "4235,83", "4.235,83", "R$ 4.235,83", "4235.83" e
 * negativo com "-" na frente. Devolve null quando não dá para ler.
 */
export function lerSaldoInformado(texto: string): number | null {
  let t = texto.trim().replace(/\s/g, "");
  let sinal = 1;
  if (t.startsWith("-")) {
    sinal = -1;
    t = t.slice(1);
  }
  t = t.replace(/^R\$/i, "");
  if (t.startsWith("-")) {
    sinal = -1;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t)) return null;
  const n = valorParaNumero(t);
  if (!Number.isFinite(n)) return null;
  return r2(sinal * n);
}

export interface PreviaAjuste {
  diferenca: number;
  /** null quando o saldo já bate. */
  tipo: "entrada" | "saida" | null;
  valor: number;
}

/** O que o ajuste vai lançar: entrada se faltava dinheiro no app, saída se sobrava. */
export function previaAjuste(saldoApp: number, saldoReal: number): PreviaAjuste {
  const diferenca = r2(saldoReal - saldoApp);
  return { diferenca, tipo: diferenca > 0 ? "entrada" : diferenca < 0 ? "saida" : null, valor: Math.abs(diferenca) };
}

/** Erro do banco quando o SQL do ajuste ainda não rodou. */
export function faltaSqlDoAjuste(mensagem: string | null | undefined): boolean {
  const m = (mensagem ?? "").toLowerCase();
  return (
    (m.includes("ajustar_saldo") && (m.includes("could not find") || m.includes("does not exist") || m.includes("schema cache"))) ||
    m.includes("rode o sql do ajuste")
  );
}
