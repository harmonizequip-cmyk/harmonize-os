import type { PricingConfig } from "./rental-pricing";

// ============================================================
// Achado estrutural na tabela de preços: como a faixa 3 (acima de
// tier2Limit) cobra a taxa menor sobre TODO o excedente — não só sobre
// o que passou do limite —, existe um ponto onde disparar UM POUCO
// A MAIS custa menos no total. Isso já era conhecido como
// comportamento intencional (ver rental-pricing.ts), mas ninguém tinha
// calculado o tamanho exato do buraco nem cruzado com o histórico real
// de locações. É exatamente esse cruzamento que este módulo faz.
// ============================================================

export interface PricingCliff {
  peakShots: number; // topo da faixa intermediária — o disparo mais caro antes da queda
  peakValue: number;
  cliffStartShots: number; // peakShots + 1 — primeiro disparo que já cai na faixa seguinte
  cliffStartValue: number;
  dropAmount: number; // quanto o valor despenca de um disparo pro outro
  deadZoneEndShots: number; // até aqui, a faixa 3 ainda cobra menos que o pico da faixa 2
}

/**
 * Retorna null quando a configuração atual não tem essa inversão (ex: se
 * tier3Rate fosse >= tier2Rate, cada disparo a mais só aumentaria o valor,
 * como seria de se esperar). Com os valores padrão do Harmonize, o buraco
 * existe — mas o cálculo é sempre feito em cima da config real (settings),
 * nunca de um número fixo, então continua correto se o preço mudar.
 */
export function analyzePricingCliff(config: PricingConfig): PricingCliff | null {
  const { flatPackageLimit, flatPackageValue, tier2Limit, tier2Rate, tier3Rate } = config;
  if (tier3Rate >= tier2Rate || tier2Limit <= flatPackageLimit) return null;

  const peakExcess = tier2Limit - flatPackageLimit;
  const peakValue = round2(flatPackageValue + peakExcess * tier2Rate);

  const cliffStartShots = tier2Limit + 1;
  const cliffStartExcess = cliffStartShots - flatPackageLimit;
  const cliffStartValue = round2(flatPackageValue + cliffStartExcess * tier3Rate);

  if (cliffStartValue >= peakValue) return null;

  // Ponto em que a faixa 3 volta a cobrar o mesmo valor do pico da faixa 2:
  // flatPackageValue + (x - flatPackageLimit) * tier3Rate = peakValue
  const deadZoneEndShots = Math.floor(flatPackageLimit + (peakValue - flatPackageValue) / tier3Rate);

  return {
    peakShots: tier2Limit,
    peakValue,
    cliffStartShots,
    cliffStartValue,
    dropAmount: round2(peakValue - cliffStartValue),
    deadZoneEndShots,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
