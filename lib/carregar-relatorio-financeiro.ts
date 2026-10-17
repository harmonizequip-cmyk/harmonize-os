import type { SupabaseClient } from "@supabase/supabase-js";
import { hojeLocal, type Periodo } from "@/lib/period";
import { resumirEmprestimos, type MovimentoEmprestimo } from "@/lib/emprestimos";
import { porCategoria, evolucaoMensal, lancamentosPorCategoria, type LinhaFinanceira } from "@/lib/relatorio-financeiro";
import type { FaturaRelatorio } from "@/components/RelatorioFinanceiro";

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
    supabase
      .from("transactions_contabilizaveis")
      .select("id, type, amount, date, description, parcela_num, parcelas_total, cartao_mov, categories(name)")
      .eq("scope", escopo)
      .gte("date", desde)
      .lte("date", periodo.fim > hoje ? periodo.fim : hoje)
      .limit(20000),
    supabase.from("faturas_cartao").select("cartao_id, fatura_ref, vencimento, total_compras, total_pago").eq("scope", escopo).order("fatura_ref"),
    supabase.from("cartoes").select("id, nome"),
    escopo === "harmonize"
      ? supabase.from("emprestimos").select("id, devedor, tipo, valor, data, descricao").eq("is_test", false)
      : Promise.resolve({ data: null }),
  ]);
  const linhas: LinhaFinanceira[] = ((linhasRaw ?? []) as any[]).map((l) => ({
    id: l.id,
    description: l.description,
    parcela: l.parcelas_total && l.parcelas_total > 1 ? `${l.parcela_num}/${l.parcelas_total}` : null,
    type: l.type,
    amount: Number(l.amount),
    date: l.date,
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
  return {
    hoje,
    gastos: porCategoria(doPeriodo, "saida"),
    entradas: porCategoria(doPeriodo, "entrada"),
    lancamentosGastos: lancamentosPorCategoria(doPeriodo, "saida"),
    lancamentosEntradas: lancamentosPorCategoria(doPeriodo, "entrada"),
    evolucao: evolucaoMensal(linhas, hoje, 12),
    faturas,
    emprestimos,
  };
}

