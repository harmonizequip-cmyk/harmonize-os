// Lista de lançamentos com o cartão agrupado: as compras de uma fatura viram uma linha só
// ("Fatura NUBANK nov/2026"), que abre a tela Cartões. A compra conta no vencimento da
// fatura (transactions.date), então todas as compras de uma fatura têm a mesma data e o
// grupo fica no lugar da primeira delas. Função pura (testada).

export interface LancamentoComCartao {
  id: string;
  amount: number | string;
  cartao_mov?: "compra" | "pagamento" | null;
  cartao_id?: string | null;
  fatura_ref?: string | null;
}

export interface GrupoFatura<T> {
  tipo: "fatura";
  chave: string;
  cartao_id: string;
  fatura_ref: string;
  total: number;
  itens: T[];
}

export type LinhaAgrupada<T> = { tipo: "lancamento"; item: T } | GrupoFatura<T>;

export function agruparPorFatura<T extends LancamentoComCartao>(linhas: T[]): LinhaAgrupada<T>[] {
  const saida: LinhaAgrupada<T>[] = [];
  const grupos = new Map<string, GrupoFatura<T>>();
  for (const l of linhas) {
    if (l.cartao_mov !== "compra" || !l.cartao_id || !l.fatura_ref) {
      saida.push({ tipo: "lancamento", item: l });
      continue;
    }
    const chave = `${l.cartao_id}|${l.fatura_ref}`;
    let g = grupos.get(chave);
    if (!g) {
      g = { tipo: "fatura", chave, cartao_id: l.cartao_id, fatura_ref: l.fatura_ref, total: 0, itens: [] };
      grupos.set(chave, g);
      saida.push(g);
    }
    g.itens.push(l);
    g.total = Math.round((g.total + Number(l.amount)) * 100) / 100;
  }
  return saida;
}

/** Endereço da tela Cartões já aberta naquele cartão e fatura. */
export function linkFatura(escopo: "harmonize" | "pessoal", cartaoId: string, faturaRef: string): string {
  return `${escopo === "pessoal" ? "/pessoal/cartoes" : "/financeiro/cartoes"}?cartao=${cartaoId}&fatura=${faturaRef}`;
}
