// Contas dos relatórios financeiros (aba Harmonize e aba Pessoal). Ficam
// fora de Entradas/Saídas: empréstimo e devolução (caixa, não resultado) e
// pagamento de fatura (as compras do cartão já contaram).

import { ehCategoriaDeEmprestimo } from "./emprestimos";
import { foraDoResultadoPorCartao, type CartaoMov } from "./cartao";

export interface LinhaFinanceira {
  type: "entrada" | "saida";
  amount: number;
  date: string;
  categoria: string | null;
  cartao_mov?: CartaoMov;
  /** Compra no cartão: dia da compra (a data acima é o vencimento da fatura, quando o gasto conta). */
  data_compra?: string | null;
  /** Só para o detalhe por categoria (lançamento de origem). */
  id?: string;
  description?: string;
  parcela?: string | null;
}

/** Um lançamento dentro de uma categoria (o "micro" do relatório). */
export interface ItemLancamento {
  id: string;
  date: string;
  description: string;
  amount: number;
  parcela: string | null;
}

export interface CategoriaSoma {
  categoria: string;
  total: number;
  pct: number;
}

export interface MesResumo {
  mes: string; // AAAA-MM
  entradas: number;
  saidas: number;
  resultado: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function contaNoResultado(l: LinhaFinanceira): boolean {
  return !ehCategoriaDeEmprestimo(l.categoria) && !foraDoResultadoPorCartao(l.cartao_mov);
}

/** Soma por categoria de um tipo, maior primeiro, com o peso de cada uma. */
export function porCategoria(linhas: LinhaFinanceira[], tipo: "entrada" | "saida"): CategoriaSoma[] {
  const mapa = new Map<string, number>();
  for (const l of linhas) {
    if (l.type !== tipo || !contaNoResultado(l)) continue;
    const nome = l.categoria ?? "Sem categoria";
    mapa.set(nome, (mapa.get(nome) ?? 0) + Number(l.amount));
  }
  const total = Array.from(mapa.values()).reduce((s, v) => s + v, 0);
  return Array.from(mapa.entries())
    .map(([categoria, v]) => ({ categoria, total: r2(v), pct: total > 0 ? v / total : 0 }))
    .sort((a, b) => b.total - a.total);
}

/** Lançamentos de cada categoria (mesmas regras de porCategoria), do mais recente ao mais antigo. */
export function lancamentosPorCategoria(linhas: LinhaFinanceira[], tipo: "entrada" | "saida"): Record<string, ItemLancamento[]> {
  const mapa: Record<string, ItemLancamento[]> = {};
  for (const l of linhas) {
    if (l.type !== tipo || !contaNoResultado(l) || !l.id) continue;
    const nome = l.categoria ?? "Sem categoria";
    (mapa[nome] ??= []).push({
      id: l.id,
      date: l.data_compra ?? l.date,
      description: l.description?.trim() || "Sem descrição",
      amount: Number(l.amount),
      parcela: l.parcela ?? null,
    });
  }
  for (const lista of Object.values(mapa)) lista.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount));
  return mapa;
}

/** Últimos `meses` meses até o mês de `hoje`, do mais antigo ao atual (mês sem lançamento entra zerado). */
export function evolucaoMensal(linhas: LinhaFinanceira[], hoje: string, meses = 12): MesResumo[] {
  const [a, m] = hoje.split("-").map(Number);
  const lista: MesResumo[] = [];
  for (let i = meses - 1; i >= 0; i--) {
    const t = a * 12 + (m - 1) - i;
    lista.push({ mes: `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`, entradas: 0, saidas: 0, resultado: 0 });
  }
  const idx = new Map(lista.map((x, i) => [x.mes, i]));
  for (const l of linhas) {
    if (!contaNoResultado(l)) continue;
    const i = idx.get(l.date.slice(0, 7));
    if (i == null) continue;
    if (l.type === "entrada") lista[i].entradas += Number(l.amount);
    else lista[i].saidas += Number(l.amount);
  }
  return lista.map((x) => ({ ...x, entradas: r2(x.entradas), saidas: r2(x.saidas), resultado: r2(x.entradas - x.saidas) }));
}
