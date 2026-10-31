// Contas dos relatórios financeiros (aba Harmonize e aba Pessoal). Ficam
// fora de Entradas/Saídas: empréstimo e devolução (caixa, não resultado),
// ajuste de saldo (só acerta o saldo) e pagamento de fatura (as compras do
// cartão já contaram).

import { ehForaDoResultado } from "./ajuste-saldo";
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
  return !ehForaDoResultado(l.categoria) && !foraDoResultadoPorCartao(l.cartao_mov);
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

// ------------------------------------------------------------
// "Tudo que saiu da conta" (Relatório da Harmonize, pedido do dono 31/10/2026):
// despesas do resultado + empréstimos concedidos no período. Resultado e lucro
// continuam sem empréstimo; este quadro só junta para mostrar tudo que saiu.
// Pagamento de fatura não entra: as compras do cartão já estão nas despesas
// (ou nos empréstimos, quando a compra é da Laser Dream), pela data do vencimento.
// ------------------------------------------------------------

export interface EmprestimoPeriodo {
  id: string;
  devedor: string;
  tipo: "concedido" | "devolucao";
  valor: number;
  data: string;
  descricao: string | null;
  origem: "manual" | "cartao";
  /** Só a pendência (sem lançamento no caixa): não saiu da conta pelo app, fica fora do total. */
  semCaixa: boolean;
  cartaoId?: string | null;
  faturaRef?: string | null;
}

export interface SaidaPorDevedor {
  devedor: string;
  caixa: number;
  cartao: number;
  total: number;
}

export interface TudoQueSaiu {
  despesas: number;
  emprestimos: number;
  emprestimosCaixa: number;
  emprestimosCartao: number;
  total: number;
  porDevedor: SaidaPorDevedor[];
  /** Empréstimos concedidos do período que entraram no total, do mais recente ao mais antigo. */
  lancamentos: EmprestimoPeriodo[];
  /** Devoluções recebidas no período (informativo, não abate o total). */
  devolvido: number;
  /** Empréstimos "só pendência" com data no período (não entram no total). */
  soPendencia: number;
}

export function tudoQueSaiu(
  gastos: CategoriaSoma[],
  emprestimos: EmprestimoPeriodo[],
  inicio: string,
  fim: string
): TudoQueSaiu {
  const despesas = r2(gastos.reduce((s, g) => s + Number(g.total), 0));
  const doPeriodo = emprestimos.filter((e) => e.data >= inicio && e.data <= fim);
  const mapa = new Map<string, SaidaPorDevedor>();
  let caixa = 0;
  let cartao = 0;
  let devolvido = 0;
  let soPendencia = 0;
  const lancamentos: EmprestimoPeriodo[] = [];
  for (const e of doPeriodo) {
    const v = Number(e.valor);
    if (e.tipo === "devolucao") {
      devolvido += v;
      continue;
    }
    if (e.origem !== "cartao" && e.semCaixa) {
      soPendencia += v;
      continue;
    }
    const d = mapa.get(e.devedor) ?? { devedor: e.devedor, caixa: 0, cartao: 0, total: 0 };
    if (e.origem === "cartao") {
      d.cartao += v;
      cartao += v;
    } else {
      d.caixa += v;
      caixa += v;
    }
    d.total += v;
    mapa.set(e.devedor, d);
    lancamentos.push(e);
  }
  const emprestimosTotal = r2(caixa + cartao);
  return {
    despesas,
    emprestimos: emprestimosTotal,
    emprestimosCaixa: r2(caixa),
    emprestimosCartao: r2(cartao),
    total: r2(despesas + emprestimosTotal),
    porDevedor: Array.from(mapa.values())
      .map((d) => ({ ...d, caixa: r2(d.caixa), cartao: r2(d.cartao), total: r2(d.total) }))
      .sort((a, b) => b.total - a.total || a.devedor.localeCompare(b.devedor)),
    lancamentos: lancamentos.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : b.valor - a.valor)),
    devolvido: r2(devolvido),
    soPendencia: r2(soPendencia),
  };
}
