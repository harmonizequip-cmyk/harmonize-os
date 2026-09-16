import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PRICING, RESERVATION_FEE, type PricingConfig } from "./rental-pricing";

export interface AppSettings {
  pricing: PricingConfig;
  reservationFee: number;
  inactiveDaysThreshold: number;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pricing: DEFAULT_PRICING,
  reservationFee: RESERVATION_FEE,
  inactiveDaysThreshold: 60,
};

/**
 * Busca a linha única de `settings` no Supabase (server-side) e mapeia
 * pro shape usado pelas telas de locação/configurações. Se a tabela
 * ainda não existir (migration do Bloco 1 não rodada) ou a query
 * falhar por qualquer motivo, cai em DEFAULT_SETTINGS — os mesmos
 * valores que já estavam fixos no código antes desse bloco, então
 * nunca quebra uma tela por causa disso.
 */
export async function fetchSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const { data, error } = await supabase
    .from("settings")
    .select(
      "flat_package_limit, flat_package_value, tier2_limit, tier2_rate, tier3_rate, reservation_fee, inactive_days_threshold"
    )
    .eq("id", true)
    .single();

  if (error || !data) {
    return DEFAULT_SETTINGS;
  }

  return {
    pricing: {
      flatPackageLimit: data.flat_package_limit,
      flatPackageValue: Number(data.flat_package_value),
      tier2Limit: data.tier2_limit,
      tier2Rate: Number(data.tier2_rate),
      tier3Rate: Number(data.tier3_rate),
      minimumShots: null,
    },
    reservationFee: Number(data.reservation_fee),
    inactiveDaysThreshold: data.inactive_days_threshold,
  };
}
