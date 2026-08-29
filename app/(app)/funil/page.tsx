import { createClient } from "@/lib/supabase/server";
import FunilClient from "./FunilClient";

export default async function FunilPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, city, whatsapp, stage, data_evento, tags, origem, notes, reservation_fee_status")
    .order("created_at", { ascending: false });

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: upcomingEvents } = await supabase
    .from("calendar_events")
    .select("client_id, date_start, confirmed")
    .neq("status", "cancelada")
    .not("client_id", "is", null)
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true });

  const nextEventByClient = new Map<string, { date_start: string; confirmed: boolean }>();
  for (const e of upcomingEvents ?? []) {
    if (!nextEventByClient.has(e.client_id)) {
      nextEventByClient.set(e.client_id, { date_start: e.date_start, confirmed: e.confirmed });
    }
  }

  const clientsWithEvents = (clients ?? []).map((c) => ({
    ...c,
    nextEvent: nextEventByClient.get(c.id) ?? null,
  }));

  return <FunilClient initialClients={clientsWithEvents} />;
}
