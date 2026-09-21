import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import { analyzePricingCliff } from "@/lib/pricing-opportunity";
import RelatoriosClient from "./RelatoriosClient";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function oneOf<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

// ============================================================
// Relatórios estratégicos: diferente do Dashboard (que mostra o dia a
// dia) e do Radar de Oportunidades tático (dias livres x leads
// parados), esta tela cruza dados que ninguém para pra somar sozinho —
// concentração de risco, buracos na precificação, funil de follow-up,
// origem que converte de verdade. Tudo calculado em cima do banco
// real a cada acesso, nunca hardcoded.
// ============================================================
export default async function RelatoriosPage() {
  const supabase = createClient();
  const settings = await fetchSettings(supabase);

  const [
    { data: rentals },
    { data: clients },
    { data: entradas },
    { data: followupTags },
    { data: bookedEvents },
  ] = await Promise.all([
    supabase.from("rentals").select("shots, calculated_value"),
    supabase.from("clients").select("id, name, origem, stage, reservation_fee_status"),
    supabase
      .from("transactions")
      .select("amount, client_id, categories(name), clients(name)")
      .eq("scope", "harmonize")
      .eq("type", "entrada"),
    supabase.from("tags").select("id, name").like("name", "Follow-up %"),
    supabase
      .from("calendar_events")
      .select("date_start")
      .in("event_type", ["hipro_1", "hipro_2"])
