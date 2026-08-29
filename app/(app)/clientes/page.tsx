import { createClient } from "@/lib/supabase/server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, clinic_name, whatsapp, city")
    .eq("stage", "cliente")
    .order("name");

  const { data: rentals } = await supabase
    .from("rentals")
    .select("client_id, calculated_value, event_date");

  const statsByClient = new Map<string, { count: number; total: number; lastDate: string | null }>();
  for (const r of rentals ?? []) {
    const current = statsByClient.get(r.client_id) ?? { count: 0, total: 0, lastDate: null };
    current.count += 1;
    current.total += Number(r.calculated_value);
    if (!current.lastDate || r.event_date > current.lastDate) current.lastDate = r.event_date;
    statsByClient.set(r.client_id, current);
  }

  const clientsWithStats = (clients ?? []).map((c) => ({
    ...c,
    stats: statsByClient.get(c.id) ?? { count: 0, total: 0, lastDate: null },
  }));

  return <ClientesClient initialClients={clientsWithStats} />;
}
