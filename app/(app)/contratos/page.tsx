import { createClient } from "@/lib/supabase/server";
import ContratosClient from "./ContratosClient";

// Controle dos contratos emitidos (leva X). O PDF em si não fica salvo —
// só o retrato (snapshot) usado em cada geração, guardado em
// contratos_emitidos.dados. Esta tela é o "onde eu vejo o que já foi
// gerado", com a opção de baixar de novo o mesmo PDF a partir do retrato.
const TETO = 1000;

export default async function ContratosPage() {
  const supabase = createClient();

  const { data: contratos, error } = await supabase
    .from("contratos_emitidos")
    .select("id, gerado_em, dados, client_id, rental_id, reservation_id, clients(name)")
    .eq("is_test", false)
    .order("gerado_em", { ascending: false })
    .limit(TETO);
  if (error) throw new Error(`Não consegui carregar os contratos: ${error.message}`);

  const normalizados = (contratos ?? []).map((c: any) => ({
    ...c,
    clients: Array.isArray(c.clients) ? (c.clients[0] ?? null) : (c.clients ?? null),
  }));

  return <ContratosClient contratos={normalizados} atingiuTeto={(contratos ?? []).length >= TETO} />;
}
