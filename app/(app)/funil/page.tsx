import { createClient } from "@/lib/supabase/server";
import FunilClient from "./FunilClient";

export default async function FunilPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, city, whatsapp, stage, data_evento, tags, origem, notes")
    .order("created_at", { ascending: false });

  return <FunilClient initialClients={clients ?? []} />;
}
