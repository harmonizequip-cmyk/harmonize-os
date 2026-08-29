import { createClient } from "@/lib/supabase/server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, clinic_name, whatsapp, city, reservation_fee_status, data_evento")
    .eq("stage", "cliente")
    .order("name");

  const { data: rentals } = await supabase
    .from("rentals")
    .select("client_id, calculated_value, event_date");

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: upcomingEvents } = await supabase
    .from("calendar_events")
    .select("client_id, date_start, confirmed")
    .neq("status", "cancelada")
    .not("client_id", "is", null)
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true });

  const statsByClient = new Map<string, { count: number; total: number; lastDate: string | null }>();
  for (const r of rentals ?? []) {
    const current = statsByClient.get(r.client_id) ?? { count: 0, total: 0, lastDate: null };
    current.count += 1;
    current.total += Number(r.calculated_value);
    if (!current.lastDate || r.event_date > current.lastDate) current.lastDate = r.event_date;
    statsByClient.set(r.client_id, current);
  }

  // Primeiro evento futuro de cada cliente (a lista já vem ordenada por data)
  const nextEventByClient = new Map<string, { date_start: string; confirmed: boolean }>();
  for (const e of upcomingEvents ?? []) {
    if (!nextEventByClient.has(e.client_id)) {
      nextEventByClient.set(e.client_id, { date_start: e.date_start, confirmed: e.confirmed });
    }
  }

  const clientsWithStats = (clients ?? []).map((c) => ({
    ...c,
    stats: statsByClient.get(c.id) ?? { count: 0, total: 0, lastDate: null },
    nextEvent: nextEventByClient.get(c.id) ?? null,
  }));

  return <ClientesClient initialClients={clientsWithStats} />;
}
