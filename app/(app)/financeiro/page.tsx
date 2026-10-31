import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/buscar-todas";
import { somarSaldo } from "@/lib/ajuste-saldo";
import FinanceiroClient from "./FinanceiroClient";
import { carregarLancamentos, type FiltrosFinanceiro } from "./carregar-lancamentos";

export default async function FinanceiroPage(props: { searchParams: Promise<FiltrosFinanceiro> }) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  // Saldo de sempre do caixa: mesma consulta e regra do "Saldo em caixa" do Dashboard
  // (e da função ajustar_saldo no banco).
  const [d, todos] = await Promise.all([
    carregarLancamentos(supabase, searchParams, "harmonize"),
    buscarTodas((de, ate) =>
      supabase
        .from("transactions_contabilizaveis")
        .select("type, amount, cartao_mov, payment_method")
        .eq("scope", "harmonize")
        .order("id")
        .range(de, ate)
    ),
  ]);
  return (
    <FinanceiroClient
      initialTransactions={d.transactions}
      categories={d.categories}
      clients={d.clients}
      nomesCartoes={d.nomesCartoes}
      filtrado={d.filtrado}
      periodo={d.periodo}
      atingiuTeto={d.atingiuTeto}
      saldoCaixa={somarSaldo((todos ?? []) as any[])}
    />
  );
}
