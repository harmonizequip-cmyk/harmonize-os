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

  return <FinanceiroClient initialTransactions={transactions ?? []} categories={categories ?? []} />;
}
