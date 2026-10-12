import { createClient } from "@/lib/supabase/server";
import FinanceiroClient from "./FinanceiroClient";
import { carregarLancamentos, type FiltrosFinanceiro } from "./carregar-lancamentos";

export default async function FinanceiroPage({ searchParams }: { searchParams: FiltrosFinanceiro }) {
  const supabase = createClient();
  const d = await carregarLancamentos(supabase, searchParams, "harmonize");
  return (
    <FinanceiroClient
      initialTransactions={d.transactions}
      categories={d.categories}
      clients={d.clients}
      periodo={d.periodo}
      atingiuTeto={d.atingiuTeto}
    />
  );
}
