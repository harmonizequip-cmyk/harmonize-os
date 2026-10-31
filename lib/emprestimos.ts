// Empréstimos a terceiros: dinheiro que sai do caixa e deve voltar. Os
// lançamentos espelho ficam nestas categorias, e as telas os deixam fora de
// Entradas/Saídas/Resultado e do faturamento (continuam no Saldo do caixa).
import { DEFAULT_PREFERENCIAS } from "./preferencias";

export const CATEGORIA_EMPRESTIMO = "Empréstimo concedido";
export const CATEGORIA_DEVOLUCAO = "Devolução de empréstimo";
const FORA_DO_RESULTADO = new Set([CATEGORIA_EMPRESTIMO, CATEGORIA_DEVOLUCAO]);

export function ehCategoriaDeEmprestimo(nome: string | null | undefined): boolean {
  return !!nome && FORA_DO_RESULTADO.has(nome);
}

/** Devedores que aparecem como sugestão mesmo antes do primeiro lançamento. */
export const DEVEDORES_SUGERIDOS: string[] = [...DEFAULT_PREFERENCIAS.listas.devedores];

const palavrasDe = (t: string) => t.trim().split(/\s+/).filter(Boolean);
const titulo = (p: string) => (p.length <= 2 ? p.toLowerCase() : p.charAt(0) + p.slice(1).toLowerCase());

/** Quantas palavras iniciais todos os nomes têm em comum (sem esvaziar nenhum). */
function palavrasComuns(todos: string[]): number {
  if (todos.length < 2) return 0;
  const base = palavrasDe(todos[0]);
  let n = 0;
  while (n < base.length - 1 && todos.every((t) => palavrasDe(t).length > n + 1 && palavrasDe(t)[n] === base[n])) n++;
  return n;
}

/** Rótulo curto do botão: tira o prefixo comum a todos ("LASER DREAM ") e põe só a inicial de cada palavra em maiúscula. */
export function rotuloDevedor(nome: string, todos: string[] = DEVEDORES_SUGERIDOS): string {
  return palavrasDe(nome).slice(palavrasComuns(todos)).map(titulo).join(" ");
}

/** Título da caixinha do Novo lançamento: "Empréstimo para a Laser Dream" com os dois padrões. */
export function tituloEmprestimo(todos: string[] = DEVEDORES_SUGERIDOS): string {
  const prefixo = palavrasDe(todos[0] ?? "").slice(0, palavrasComuns(todos)).map(titulo).join(" ");
  if (!prefixo) return "Empréstimo";
  return prefixo === "Laser Dream" ? "Empréstimo para a Laser Dream" : `Empréstimo para ${prefixo}`;
}

/** Nome comum a todos os devedores, com cara de título ("Laser Dream"); vazio se não houver. */
export function grupoDevedores(todos: string[] = DEVEDORES_SUGERIDOS): string {
  return palavrasDe(todos[0] ?? "").slice(0, palavrasComuns(todos)).map(titulo).join(" ");
}

/** Selo curto: prefixo comum mais as iniciais do resto ("LASER DREAM JP"). */
export function siglaDevedor(nome: string, todos: string[] = DEVEDORES_SUGERIDOS): string {
  const palavras = palavrasDe(nome);
  const comum = palavrasComuns(Array.from(new Set([...todos, nome])));
  const resto = palavras.slice(comum);
  if (comum === 0 || resto.length === 0) return nome;
  return [...palavras.slice(0, comum), resto.map((p) => p.charAt(0)).join("")].join(" ");
}

/** De onde veio o empréstimo: lançado à mão (caixa ou só pendência) ou parcela de compra no cartão. */
export type OrigemEmprestimo = "manual" | "cartao";

/** Espaço do empréstimo: caixa e cartões da Harmonize ou conta e cartões pessoais. */
export type EscopoEmprestimo = "harmonize" | "pessoal";

/** Endereço da fatura onde está a parcela (empréstimo de origem cartão). */
export function linkFaturaDoEmprestimo(
  cartaoId: string | null | undefined,
  faturaRef: string | null | undefined,
  escopo: EscopoEmprestimo = "harmonize"
): string {
  const base = escopo === "pessoal" ? "/pessoal/cartoes" : "/financeiro/cartoes";
  if (!cartaoId) return base;
  return `${base}?cartao=${cartaoId}${faturaRef ? `&fatura=${faturaRef}` : ""}`;
}

/** Tela de Empréstimos do espaço. */
export function linkEmprestimos(escopo: EscopoEmprestimo = "harmonize"): string {
  return escopo === "pessoal" ? "/pessoal/emprestimos" : "/financeiro/emprestimos";
}

/** Aviso quando o SQL dos empréstimos do Pessoal (migration 2026-10-31-pessoal-emprestimos-e-categorias.sql) ainda não rodou. */
export const MSG_FALTA_SQL_EMPRESTIMO_PESSOAL = "Falta rodar o SQL dos empréstimos do Pessoal.";

/**
 * Erro que mostra que o banco ainda não conhece empréstimo no Pessoal: função sem
 * o parâmetro p_scope, coluna scope que não existe ou a recusa antiga
 * "Só compra num cartão da Harmonize".
 */
export function faltaSqlEmprestimoPessoal(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    error.code === "42703" ||
    /could not find the function|does not exist|cart[aã]o da Harmonize/i.test(msg)
  );
}

export interface MovimentoEmprestimo {
  id: string;
  devedor: string;
  tipo: "concedido" | "devolucao";
  valor: number;
  data: string;
  descricao: string | null;
  forma?: string | null;
  /** Só a pendência: sem lançamento no caixa (empréstimo antigo). */
  semCaixa?: boolean;
  /** Parcela de compra no cartão da Harmonize (desfaz no cartão, não aqui). */
  origem?: OrigemEmprestimo;
  cartaoId?: string | null;
  faturaRef?: string | null;
}

export interface ResumoDevedor {
  devedor: string;
  concedido: number;
  devolvido: number;
  saldo: number;
  movimentos: MovimentoEmprestimo[];
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Agrupa por devedor, maior saldo primeiro; movimentos do mais recente ao mais antigo. */
export function resumirEmprestimos(movimentos: MovimentoEmprestimo[]): ResumoDevedor[] {
  const porDevedor = new Map<string, ResumoDevedor>();
  for (const m of movimentos) {
    const r = porDevedor.get(m.devedor) ?? { devedor: m.devedor, concedido: 0, devolvido: 0, saldo: 0, movimentos: [] };
    if (m.tipo === "concedido") r.concedido += Number(m.valor);
    else r.devolvido += Number(m.valor);
    r.movimentos.push(m);
    porDevedor.set(m.devedor, r);
  }
  return Array.from(porDevedor.values())
    .map((r) => ({
      ...r,
      concedido: centavos(r.concedido),
      devolvido: centavos(r.devolvido),
      saldo: centavos(r.concedido - r.devolvido),
      movimentos: [...r.movimentos].sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0)),
    }))
    .sort((a, b) => b.saldo - a.saldo || a.devedor.localeCompare(b.devedor));
}
