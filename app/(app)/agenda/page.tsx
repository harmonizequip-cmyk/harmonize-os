import { createClient } from "@/lib/supabase/server";
import AgendaClient from "./AgendaClient";

export default async function AgendaPage() {
  const supabase = createClient();

  const { data: events } = await supabase
    .from("calendar_events")
    .select("id, event_type, title, date_start, status, confirmed, value, client_id, clients(name), rental_id")
    .neq("status", "cancelada")
    .order("date_start", { ascending: true });

  const { data: clients } = await supabase.from("clients").select("id, name").order("name");

  const normalizedEvents = (events ?? []).map((e: any) => ({
    ...e,
    clients: Array.isArray(e.clients) ? (e.clients[0] ?? null) : (e.clients ?? null),
  }));

  return <AgendaClient initialEvents={normalizedEvents} clients={clients ?? []} />;
}
