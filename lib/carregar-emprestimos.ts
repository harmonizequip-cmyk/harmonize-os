// Carrega os movimentos de empréstimo de um espaço (Harmonize ou Pessoal), para a
// tela Empréstimos e para o relatório financeiro.
//
// Desde 31/10/2026 (migration 2026-10-31-pessoal-emprestimos-e-categorias.sql)
// emprestimos tem `scope`. Sem esse SQL rodado: na Harmonize lê como antes (tudo
// é Harmonize; e, sem a coluna origem, tudo vira origem manual); no Pessoal não
// há nada para mostrar e `faltaSql` avisa a tela.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EscopoEmprestimo, MovimentoEmprestimo } from "@/lib/emprestimos";

export interface MovimentosEmprestimo {
  movimentos: MovimentoEmprestimo[];
  /** Pessoal sem o SQL novo rodado (coluna scope não existe). */
  faltaSql: boolean;
}

function oneOf<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function paraMovimento(m: any): MovimentoEmprestimo {
  const t = oneOf<{ payment_method?: string | null; cartao_id?: string | null; fatura_ref?: string | null }>(m.transactions);
  return {
    id: m.id,
    devedor: m.devedor,
    tipo: m.tipo,
    valor: Number(m.valor),
    data: m.data,
    descricao: m.descricao,
    semCaixa: !m.transaction_id,
    forma: t?.payment_method ?? null,
    origem: m.origem === "cartao" ? "cartao" : "manual",
    cartaoId: t?.cartao_id ?? null,
    faturaRef: t?.fatura_ref ?? null,
  };
}

const CAMPOS = "id, devedor, tipo, valor, data, descricao, origem, transaction_id, transactions(payment_method, cartao_id, fatura_ref)";

export async function carregarMovimentosEmprestimo(
  supabase: SupabaseClient,
  escopo: EscopoEmprestimo
): Promise<MovimentosEmprestimo> {
  const comEspaco = await supabase
    .from("emprestimos")
    .select(CAMPOS)
    .eq("is_test", false)
    .eq("scope", escopo)
    .order("data", { ascending: false });
  if (!comEspaco.error) return { movimentos: (comEspaco.data ?? []).map(paraMovimento), faltaSql: false };

  // Sem a coluna scope: o Pessoal ainda não tem empréstimos. Outro erro aparece na tela.
  if (escopo === "pessoal") {
    const e = comEspaco.error;
    if (e.code === "42703" || /scope/i.test(e.message ?? "")) return { movimentos: [], faltaSql: true };
    throw new Error(`Não consegui carregar os empréstimos: ${e.message}`);
  }

  // Harmonize como antes: com a origem (SQL do cartão) ou sem ela.
  const comOrigem = await supabase.from("emprestimos").select(CAMPOS).eq("is_test", false).order("data", { ascending: false });
  const { data, error } = comOrigem.error
    ? await supabase
        .from("emprestimos")
        .select("id, devedor, tipo, valor, data, descricao, transaction_id, transactions(payment_method)")
        .eq("is_test", false)
        .order("data", { ascending: false })
    : comOrigem;
  if (error) throw new Error(`Não consegui carregar os empréstimos: ${error.message}`);
  return { movimentos: (data ?? []).map(paraMovimento), faltaSql: false };
}
