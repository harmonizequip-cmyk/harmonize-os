import { createClient } from "@/lib/supabase/server";
import { resumirEmprestimos, type MovimentoEmprestimo } from "@/lib/emprestimos";
import EmprestimosClient from "./EmprestimosClient";

// Empréstimos que o dono fez a terceiros (LASER DREAM etc.): quanto saiu,
// quanto voltou e quanto ainda falta voltar, por devedor.
export default async function EmprestimosPage() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("emprestimos")
    .select("id, devedor, tipo, valor, data, descricao")
    .eq("is_test", false)
    .order("data", { ascending: false });
  if (error) throw new Error(`Não consegui carregar os empréstimos: ${error.message}`);

  const movimentos: MovimentoEmprestimo[] = (data ?? []).map((m: any) => ({
    id: m.id,
    devedor: m.devedor,
    tipo: m.tipo,
    valor: Number(m.valor),
    data: m.data,
    descricao: m.descricao,
  }));

  return <EmprestimosClient devedores={resumirEmprestimos(movimentos)} />;
}
