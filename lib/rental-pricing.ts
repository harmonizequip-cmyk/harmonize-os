// ============================================================
// HARMONIZE OS — Cálculo de valor da locação HIPRO Day
// ============================================================
// Modelo progressivo por faixa (marginal), confirmado em conversa:
//   - até 20.000 disparos: pacote fixo de R$ 2.500,00
//   - de 20.001 a 80.000 disparos: R$ 0,10 por disparo (só a parte
//     que cai nessa faixa, os primeiros 20.000 já estão no pacote)
//   - acima de 80.000 disparos: R$ 0,07 por disparo (só a parte
//     que excede 80.000)
//
// Se algum valor mudar, edite só as constantes abaixo.
// ============================================================

export const RESERVATION_FEE = 250.0;

export const PRICING = {
  FLAT_PACKAGE_LIMIT: 20_000,   // disparos incluídos no pacote fixo
  FLAT_PACKAGE_VALUE: 2500.0,   // valor do pacote fixo (R$)
  TIER_2_LIMIT: 80_000,         // limite da segunda faixa
  TIER_2_RATE: 0.10,            // R$/disparo entre 20.001 e 80.000
  TIER_3_RATE: 0.07,            // R$/disparo acima de 80.000

  // Confirmado: não existe mínimo de disparos por sessão.
  // O valor fixo de R$ 2.500 cobre qualquer volume até 20.000.
  MINIMUM_SHOTS: null as number | null,
} as const;

export interface RentalPricingBreakdown {
  shots: number;
  flatPackagePortion: number;   // disparos cobertos pelo pacote fixo
  tier2Portion: number;         // disparos cobrados a TIER_2_RATE
  tier3Portion: number;         // disparos cobrados a TIER_3_RATE
  flatPackageValue: number;
  tier2Value: number;
  tier3Value: number;
  totalValue: number;
}

export class RentalPricingError extends Error {}

/**
 * Calcula o valor de uma locação HIPRO Day a partir da quantidade de disparos.
 * Lança RentalPricingError se a quantidade for inválida ou abaixo do mínimo
 * (quando PRICING.MINIMUM_SHOTS estiver configurado).
 */
export function calculateRentalValue(shots: number): RentalPricingBreakdown {
  if (!Number.isFinite(shots) || shots <= 0) {
    throw new RentalPricingError("Quantidade de disparos deve ser um número positivo.");
  }
  if (PRICING.MINIMUM_SHOTS !== null && shots < PRICING.MINIMUM_SHOTS) {
    throw new RentalPricingError(
      `Quantidade mínima de disparos é ${PRICING.MINIMUM_SHOTS.toLocaleString("pt-BR")}.`
    );
  }

  const flatPackagePortion = Math.min(shots, PRICING.FLAT_PACKAGE_LIMIT);
  const tier2Portion = Math.max(
    0,
    Math.min(shots, PRICING.TIER_2_LIMIT) - PRICING.FLAT_PACKAGE_LIMIT
  );
  const tier3Portion = Math.max(0, shots - PRICING.TIER_2_LIMIT);

  const flatPackageValue = PRICING.FLAT_PACKAGE_VALUE;
  const tier2Value = round2(tier2Portion * PRICING.TIER_2_RATE);
  const tier3Value = round2(tier3Portion * PRICING.TIER_3_RATE);

  const totalValue = round2(flatPackageValue + tier2Value + tier3Value);

  return {
    shots,
    flatPackagePortion,
    tier2Portion,
    tier3Portion,
    flatPackageValue,
    tier2Value,
    tier3Value,
    totalValue,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------
// Casos de verificação (rodar com: npx tsx lib/rental-pricing.ts)
// ------------------------------------------------------------
if (require.main === module) {
  const cases = [15_000, 20_000, 20_001, 50_000, 80_000, 100_000];
  for (const shots of cases) {
    const r = calculateRentalValue(shots);
    console.log(
      `${shots.toLocaleString("pt-BR")} disparos -> R$ ${r.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    );
  }
}
