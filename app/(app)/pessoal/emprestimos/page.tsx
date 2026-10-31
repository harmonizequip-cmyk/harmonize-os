import { createClient } from "@/lib/supabase/server";
import { resumirEmprestimos } from "@/lib/emprestimos";
import { carregarMovimentosEmprestimo } from "@/lib/carregar-emprestimos";
import EmprestimosClient from "../../financeiro/emprestimos/EmprestimosClient";

// Empréstimos feitos com o dinheiro pessoal (conta ou cartão pessoal), a mesma
// tela da Harmonize filtrada pelo espaço Pessoal (31/10/2026).
export default async function EmprestimosPessoaisPage() {
  const supabase = createClient();
  const { movimentos, faltaSql } = await carregarMovimentosEmprestimo(supabase, "pessoal");
  return <EmprestimosClient devedores={resumirEmprestimos(movimentos)} escopo="pessoal" faltaSql={faltaSql} />;
}
