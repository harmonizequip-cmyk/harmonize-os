import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import FinanceiroClient from "../financeiro/FinanceiroClient";
import { carregarLancamentos, type FiltrosFinanceiro } from "../financeiro/carregar-lancamentos";

// Financeiro pessoal: mesma tela do Financeiro, com os lançamentos de
// scope = 'pessoal', o saldo de sempre da conta e as contas fixas pessoais
// (Configurações > contas fixas do tipo pessoal).
export default async function PessoalPage({ searchParams }: { searchParams: FiltrosFinanceiro }) {
  const supabase = createClient();
  const [d, settings, { data: todos }] = await Promise.all([
    carregarLancamentos(supabase, searchParams, "pessoal"),
    fetchSettings(supabase),
    supabase.from("transactions").select("type, amount").eq("scope", "pessoal").eq("is_test", false).limit(20000),
  ]);
  const saldo = (todos ?? []).reduce((s, t: any) => s + (t.type === "entrada" ? 1 : -1) * Number(t.amount), 0);
  const fixas = settings.despesasFixas.filter((f) => f.tipo === "pessoal").map((f) => ({ nome: f.nome, valor: f.valor }));
  return (
    <FinanceiroClient
      initialTransactions={d.transactions}
      categories={d.categories}
      clients={d.clients}
      periodo={d.periodo}
      atingiuTeto={d.atingiuTeto}
      escopo="pessoal"
      resumoPessoal={{ saldo: Math.round(saldo * 100) / 100, fixas }}
    />
  );
}
