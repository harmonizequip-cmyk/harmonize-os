import { createClient } from "@/lib/supabase/server";
import CartoesClient, { type Cartao, type Fatura } from "./CartoesClient";

// Cartões de crédito e as faturas de cada um (view faturas_cartao). Mostra os
// cartões da Harmonize e os pessoais que o login pode ver.
export default async function CartoesPage() {
  const supabase = createClient();
  const [{ data: cartoes }, { data: faturas }, { data: categorias }] = await Promise.all([
    supabase.from("cartoes").select("id, nome, scope, dia_fechamento, dia_vencimento, limite, ativo").order("nome"),
    supabase.from("faturas_cartao").select("cartao_id, fatura_ref, vencimento, fechamento, total_compras, total_pago"),
    supabase.from("categories").select("id, name").eq("scope", "harmonize").eq("type", "saida").order("name"),
  ]);
  return (
    <CartoesClient
      escopo="harmonize"
      categorias={(categorias ?? []) as { id: string; name: string }[]}
      cartoes={(cartoes ?? []) as Cartao[]}
      faturas={((faturas ?? []) as any[]).map((f) => ({ ...f, total_compras: Number(f.total_compras), total_pago: Number(f.total_pago) })) as Fatura[]}
    />
  );
}
