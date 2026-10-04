import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { buscarPendencias } from "@/lib/pendencias";
import PendenciasClient from "./PendenciasClient";

// Controle de pendências de pagamento: quem está devendo, quanto e há
// quantos dias. O cálculo vive em lib/pendencias.ts e é o mesmo do total
// do Dashboard.
export default async function PendenciasPage() {
  const supabase = createClient();
  const pendencias = await buscarPendencias(supabase, hojeLocal());
  return <PendenciasClient pendencias={pendencias} />;
}
