import { createClient } from "@/lib/supabase/server";
import ClientesClient from "./ClientesClient";

export default async function ClientesPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, name, clinic_name, whatsapp, city")
    .order("name");

  return <ClientesClient initialClients={clients ?? []} />;
}
