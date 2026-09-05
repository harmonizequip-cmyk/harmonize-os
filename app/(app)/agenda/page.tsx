import { createClient } from "@/lib/supabase/server";
import AgendaClient from "./AgendaClient";

export default async function AgendaPage() {
  const supabase = createClient();

  const { data: events } = await supabase
    .from("calendar_events")
    .select(
      "id, event_type, title, date_start, status, confirmed, value, client_id, equipment_id, clients(name, whatsapp), rental_id, notes"
    )
    .neq("status", "cancelada")
    .order("date_start", { ascending: true });

  const { data: clients } = await supabase.from("clients").select("id, name").order("name");
  const { data: equipments } = await supabase.from("equipments").select("id, code, name").order("code");

  const normalizedEvents = (events ?? []).map((e: any) => ({
    ...e,
    clients: Array.isArray(e.clients) ? (e.clients[0] ?? null) : (e.clients ?? null),
  }));

  return <AgendaClient initialEvents={normalizedEvents} clients={clients ?? []} equipments={equipments ?? []} />;
}
