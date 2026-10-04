import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { fetchSettings } from "@/lib/settings";
import { buscarPendencias, buscarTaxasVencidas } from "@/lib/pendencias";
import PendenciasClient from "./PendenciasClient";

// Controle de pendências de pagamento: quem está devendo, quanto e há
// quantos dias. O cálculo vive em lib/pendencias.ts e é o mesmo do total
// do Dashboard. Também lista as taxas de reserva vencidas, que o aviso
// vermelho do Dashboard aponta para cá.
export default async function PendenciasPage() {
  const supabase = createClient();
  const hoje = hojeLocal();
  const { diasCobrancaTaxa } = await fetchSettings(supabase);
  const [pendencias, taxas] = await Promise.all([
    buscarPendencias(supabase, hoje),
    buscarTaxasVencidas(supabase, hoje, diasCobrancaTaxa),
  ]);
  return <PendenciasClient pendencias={pendencias} taxas={taxas} diasCobrancaTaxa={diasCobrancaTaxa} />;
}
