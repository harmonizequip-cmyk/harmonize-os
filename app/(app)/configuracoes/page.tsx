import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import ConfiguracoesClient from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  const supabase = createClient();

  const settings = await fetchSettings(supabase);
  const { data: tags } = await supabase.from("tags").select("id, name, color, is_automatic").order("name");

  return <ConfiguracoesClient initialSettings={settings} initialTags={tags ?? []} />;
}
