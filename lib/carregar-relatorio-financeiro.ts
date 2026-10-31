import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeLocal, type Periodo } from "@/lib/period";
import { resumirEmprestimos, type MovimentoEmprestimo } from "@/lib/emprestimos";
import {
  porCategoria,
  evolucaoMensal,
  lancamentosPorCategoria,
  tudoQueSaiu,
  type EmprestimoPeriodo,
  type LinhaFinanceira,
} from "@/lib/relatorio-financeiro";
import type { FaturaRelatorio } from "@/components/RelatorioFinanceiro";
import { buscarTodas } from "@/lib/buscar-todas";
import { carregarMovimentosEmprestimo } from "@/lib/carregar-emprestimos";

// Empréstimos do espaço com a origem (caixa ou cartão). Sem o SQL dos empréstimos
// do Pessoal, a Harmonize lê como antes e o Pessoal fica sem (data nula: os quadros somem).
async function carregarEmprestimos(
  supabase: SupabaseClient,
  escopo: "harmonize" | "pessoal"
): Promise<{ data: EmprestimoPeriodo[] | null; faltaSql: boolean }> {
  try {
    const { movimentos, faltaSql } = await carregarMovimentosEmprestimo(supabase, escopo);
    if (faltaSql) return { data: null, faltaSql: true };
    return {
      data: movimentos.map((m) => ({
        id: m.id,
        devedor: m.devedor,
        tipo: m.tipo,
        valor: Number(m.valor),
        data: m.data,
        descricao: m.descricao,
        origem: m.origem === "cartao" ? "cartao" : "manual",
        semCaixa: !!m.semCaixa,
        cartaoId: m.cartaoId ?? null,
        faturaRef: m.faturaRef ?? null,
      })),
      faltaSql: false,
    };
  } catch {
    // Como antes: sem empréstimos o relatório abre sem esses quadros.
    return { data: null, faltaSql: false };
  }
}

function oneOf<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

// Dados do relatório financeiro de um lado (Harmonize ou Pessoal).
export async function carregarFinanceiro(supabase: SupabaseClient, escopo: "harmonize" | "pessoal", periodo: Periodo) {
  const hoje = hojeLocal();
  const [a, m] = hoje.split("-").map(Number);
  const t = a * 12 + (m - 1) - 11;
  const inicio12 = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
  const desde = periodo.inicio < inicio12 ? periodo.inicio : inicio12;
  const [{ data: linhasRaw }, { data: faturasRaw }, { data: cartoesRaw }, emprestimosRes] = await Promise.all([
    buscarTodas((de, ate) =>
      supabase
        .from("transactions_contabilizaveis")
        .select("id, type, amount, date, data_compra, description, parcela_num, parcelas_total, cartao_mov, categories(name)")
        .eq("scope", escopo)
        .gte("date", desde)
        .lte("date", periodo.fim > hoje ? periodo.fim : hoje)
        .order("id")
        .range(de, ate)
    ).then((data) => ({ data })),
    supabase.from("faturas_cartao").select("cartao_id, fatura_ref, vencimento, total_compras, total_pago").eq("scope", escopo).order("fatura_ref"),
    supabase.from("cartoes").select("id, nome"),
    carregarEmprestimos(supabase, escopo),
  ]);
  const linhas: LinhaFinanceira[] = ((linhasRaw ?? []) as any[]).map((l) => ({
    id: l.id,
    description: l.description,
    parcela: l.parcelas_total && l.parcelas_total > 1 ? `${l.parcela_num}/${l.parcelas_total}` : null,
    type: l.type,
    amount: Number(l.amount),
    date: l.date,
    data_compra: l.data_compra ?? null,
    cartao_mov: l.cartao_mov,
    categoria: oneOf<{ name: string }>(l.categories)?.name ?? null,
  }));
  const doPeriodo = linhas.filter((l) => l.date >= periodo.inicio && l.date <= periodo.fim);
  const nomeCartao = new Map(((cartoesRaw ?? []) as any[]).map((c) => [c.id, c.nome as string]));
  const faturas: FaturaRelatorio[] = ((faturasRaw ?? []) as any[]).map((f) => ({
    cartao: nomeCartao.get(f.cartao_id) ?? "Cartão",
    fatura_ref: f.fatura_ref,
    vencimento: f.vencimento,
    total_compras: Number(f.total_compras),
    total_pago: Number(f.total_pago),
  }));
  const emprestimos = emprestimosRes.data
    ? resumirEmprestimos(
        (emprestimosRes.data as any[]).map((e) => ({ ...e, valor: Number(e.valor) })) as MovimentoEmprestimo[]
      ).map(({ devedor, concedido, devolvido, saldo }) => ({ devedor, concedido, devolvido, saldo }))
    : undefined;
  const gastos = porCategoria(doPeriodo, "saida");
  const saidas = emprestimosRes.data
    ? tudoQueSaiu(gastos, emprestimosRes.data as EmprestimoPeriodo[], periodo.inicio, periodo.fim)
    : undefined;
  return {
    hoje,
    gastos,
    saidas,
    entradas: porCategoria(doPeriodo, "entrada"),
    lancamentosGastos: lancamentosPorCategoria(doPeriodo, "saida"),
    lancamentosEntradas: lancamentosPorCategoria(doPeriodo, "entrada"),
    evolucao: evolucaoMensal(linhas, hoje, 12),
    faturas,
    emprestimos,
    emprestimosFaltaSql: emprestimosRes.faltaSql,
  };
}

