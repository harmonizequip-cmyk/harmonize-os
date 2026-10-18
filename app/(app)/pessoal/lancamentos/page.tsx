import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import { foraDoSaldo } from "@/lib/cartao";
import { buscarTodas } from "@/lib/buscar-todas";
import FinanceiroClient from "../../financeiro/FinanceiroClient";
import { carregarLancamentos, type FiltrosFinanceiro } from "../../financeiro/carregar-lancamentos";

// Financeiro pessoal: mesma tela do Financeiro, com os lançamentos de
// scope = 'pessoal', o saldo de sempre da conta e as contas fixas pessoais
// (Configurações > contas fixas do tipo pessoal).
export default async function PessoalPage(props: { searchParams: Promise<FiltrosFinanceiro> }) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const [d, settings, { data: todos }] = await Promise.all([
    carregarLancamentos(supabase, searchParams, "pessoal"),
    fetchSettings(supabase),
    buscarTodas((de, ate) => supabase.from("transactions").select("type, amount, cartao_mov, payment_method").eq("scope", "pessoal").eq("is_test", false).order("id").range(de, ate)).then((data) => ({ data })),
  ]);
  // Compra no cartão só sai da conta quando a fatura é paga.
  const saldo = (todos ?? []).filter((t: any) => !foraDoSaldo(t)).reduce((s, t: any) => s + (t.type === "entrada" ? 1 : -1) * Number(t.amount), 0);
  const fixas = settings.despesasFixas.filter((f) => f.tipo === "pessoal").map((f) => ({ nome: f.nome, valor: f.valor }));
  return (
    <FinanceiroClient
      initialTransactions={d.transactions}
      categories={d.categories}
      clients={d.clients}
      nomesCartoes={d.nomesCartoes}
      periodo={d.periodo}
      atingiuTeto={d.atingiuTeto}
      escopo="pessoal"
      resumoPessoal={{ saldo: Math.round(saldo * 100) / 100, fixas }}
    />
  );
}
