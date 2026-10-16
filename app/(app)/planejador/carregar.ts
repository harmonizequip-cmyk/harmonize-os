import type { SupabaseClient } from "@supabase/supabase-js";

const nomeDe = (c: any) => (c ? [c.treatment, c.display_name || c.name].filter(Boolean).join(" ") : null);
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Nome com tratamento, como vai no campo "Profissional" do planejador. */
export const nomeProfissional = nomeDe;

/** Clientes para o seletor do editor e o filtro da lista. */
export async function carregarClientes(supabase: SupabaseClient) {
  const { data } = await supabase.from("clients").select("id, name, display_name, treatment, city, whatsapp").eq("is_test", false).order("name");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, city: c.city, whatsapp: c.whatsapp, profissional: nomeDe(c) as string }));
}

/** Atendimento (para a data) e cliente de um planejamento novo vindo por atalho. */
export async function carregarContexto(supabase: SupabaseClient, clienteId?: string | null, eventoId?: string | null) {
  let evento: { id: string; date_start: string; client_id: string | null } | null = null;
  if (eventoId) {
    const { data } = await supabase.from("calendar_events").select("id, date_start, client_id").eq("id", eventoId).maybeSingle();
    evento = data ?? null;
  }
  return { clienteId: clienteId || evento?.client_id || null, evento };
}

export { um };
