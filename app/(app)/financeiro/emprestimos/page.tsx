import { createClient } from "@/lib/supabase/server";
import { resumirEmprestimos, type MovimentoEmprestimo } from "@/lib/emprestimos";
import EmprestimosClient from "./EmprestimosClient";

// Empréstimos que o dono fez a terceiros (LASER DREAM etc.): quanto saiu,
// quanto voltou e quanto ainda falta voltar, por devedor.
export default async function EmprestimosPage() {
  const supabase = createClient();
  // Com a origem (caixa ou cartão); sem o SQL do empréstimo no cartão, lê como antes.
  const novo = await supabase
    .from("emprestimos")
    .select("id, devedor, tipo, valor, data, descricao, origem, transaction_id, transactions(payment_method, cartao_id, fatura_ref)")
    .eq("is_test", false)
    .order("data", { ascending: false });
  const { data, error } = novo.error
    ? await supabase
        .from("emprestimos")
        .select("id, devedor, tipo, valor, data, descricao, transaction_id, transactions(payment_method)")
        .eq("is_test", false)
        .order("data", { ascending: false })
    : novo;
  if (error) throw new Error(`Não consegui carregar os empréstimos: ${error.message}`);

  const movimentos: MovimentoEmprestimo[] = (data ?? []).map((m: any) => {
    const t = Array.isArray(m.transactions) ? m.transactions[0] : m.transactions;
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
  });

  return <EmprestimosClient devedores={resumirEmprestimos(movimentos)} />;
}
