import { createClient } from "@/lib/supabase/server";
import FinanceiroClient from "./FinanceiroClient";

export default async function FinanceiroPage() {
  const supabase = createClient();

  const [{ data: transactions }, { data: categories }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, description, amount, payment_method, date, category_id, categories(name)")
      .eq("scope", "harmonize")
      .order("date", { ascending: false })
      .limit(200),
    supabase.from("categories").select("id, name, type").eq("scope", "harmonize").order("name"),
  ]);

  // O Supabase retorna a relação "categories" como objeto único em tempo de
  // execução (cada lançamento tem uma só categoria), mas sem os tipos
  // gerados do banco o TypeScript infere como array. Normalizamos aqui
  // para o formato real, cobrindo os dois formatos possíveis com segurança.
  const normalizedTransactions = (transactions ?? []).map((t: any) => ({
    ...t,
    categories: Array.isArray(t.categories) ? (t.categories[0] ?? null) : (t.categories ?? null),
  }));

  return <FinanceiroClient initialTransactions={normalizedTransactions} categories={categories ?? []} />;
}

