// Empréstimos a terceiros: dinheiro que sai do caixa e deve voltar. Os
// lançamentos espelho ficam nestas categorias, e as telas os deixam fora de
// Entradas/Saídas/Resultado e do faturamento (continuam no Saldo do caixa).
export const CATEGORIA_EMPRESTIMO = "Empréstimo concedido";
export const CATEGORIA_DEVOLUCAO = "Devolução de empréstimo";
const FORA_DO_RESULTADO = new Set([CATEGORIA_EMPRESTIMO, CATEGORIA_DEVOLUCAO]);

export function ehCategoriaDeEmprestimo(nome: string | null | undefined): boolean {
  return !!nome && FORA_DO_RESULTADO.has(nome);
}

/** Devedores que aparecem como sugestão mesmo antes do primeiro lançamento. */
export const DEVEDORES_SUGERIDOS = ["LASER DREAM CAMPINA GRANDE", "LASER DREAM JOÃO PESSOA"];

export interface MovimentoEmprestimo {
  id: string;
  devedor: string;
  tipo: "concedido" | "devolucao";
  valor: number;
  data: string;
  descricao: string | null;
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
