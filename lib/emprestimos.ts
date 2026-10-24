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
