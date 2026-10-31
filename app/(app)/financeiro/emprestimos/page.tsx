import { createClient } from "@/lib/supabase/server";
import { resumirEmprestimos } from "@/lib/emprestimos";
import { carregarMovimentosEmprestimo } from "@/lib/carregar-emprestimos";
import EmprestimosClient from "./EmprestimosClient";

// Empréstimos que o dono fez a terceiros (LASER DREAM etc.) com o dinheiro da
// Harmonize: quanto saiu, quanto voltou e quanto ainda falta voltar, por devedor.
// Os do Pessoal ficam em /pessoal/emprestimos.
export default async function EmprestimosPage() {
  const supabase = createClient();
  const { movimentos } = await carregarMovimentosEmprestimo(supabase, "harmonize");
  return <EmprestimosClient devedores={resumirEmprestimos(movimentos)} escopo="harmonize" />;
}
