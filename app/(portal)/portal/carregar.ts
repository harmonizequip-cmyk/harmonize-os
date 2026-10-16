import type { SupabaseClient } from "@supabase/supabase-js";

/** Cliente do login (portal_cliente): id, nome e "Profissional" (tratamento + nome). */
export async function clienteDoPortal(supabase: SupabaseClient) {
  const { data } = await supabase.rpc("portal_cliente");
  const c = (Array.isArray(data) ? data[0] : data) as { client_id: string; nome: string; profissional: string } | null;
  return c ?? null;
}
