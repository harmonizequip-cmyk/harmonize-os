// ============================================================
// HARMONIZE OS — Cálculo de valor da locação HIPRO Day
// ============================================================
// Modelo por faixa única (não progressivo/marginal), confirmado com
// exemplos numéricos em conversa:
//   - até 20.000 disparos: pacote fixo de R$ 2.500,00
//   - de 20.001 a 80.000 disparos: TODO o excedente acima de 20.000
//     é cobrado a R$ 0,10/disparo
//     Ex: 70.000 disparos -> 2.500 + (50.000 x 0,10) = R$ 7.500,00
//   - acima de 80.000 disparos: TODO o excedente acima de 20.000
//     (não só a parte que passou de 80.000) passa a ser cobrado a
//     R$ 0,07/disparo — a taxa de 0,10 deixa de valer inteiramente
//     Ex: 90.000 disparos -> 2.500 + (70.000 x 0,07) = R$ 7.400,00
//
// Importante: como a faixa acima de 80.000 usa uma taxa mais baixa
// sobre TODO o excedente (não só o incremento), existe um ponto onde
// disparar um pouco mais pode custar menos no total. Isso é
// intencional conforme confirmado, não é bug.
//
// Se algum valor mudar, edite só as constantes abaixo.
// ============================================================

export const RESERVATION_FEE = 250.0;

export const PRICING = {
  FLAT_PACKAGE_LIMIT: 20_000,   // disparos incluídos no pacote fixo
  FLAT_PACKAGE_VALUE: 2500.0,   // valor do pacote fixo (R$)
  TIER_2_LIMIT: 80_000,         // até aqui, o excedente todo é a TIER_2_RATE
  TIER_2_RATE: 0.10,            // R$/disparo sobre o excedente, faixa 20.001-80.000
  TIER_3_RATE: 0.07,            // R$/disparo sobre TODO o excedente, acima de 80.000

  // Confirmado: não existe mínimo de disparos por sessão.
  // O valor fixo de R$ 2.500 cobre qualquer volume até 20.000.
  MINIMUM_SHOTS: null as number | null,
} as const;

export interface RentalPricingBreakdown {
  shots: number;
  flatPackagePortion: number;   // disparos cobertos pelo pacote fixo
  tier2Portion: number;         // disparos cobrados a TIER_2_RATE (0 se estiver na faixa 3)
  tier3Portion: number;         // disparos cobrados a TIER_3_RATE (0 se estiver na faixa 1 ou 2)
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
  const excess = Math.max(0, shots - PRICING.FLAT_PACKAGE_LIMIT);

  let tier2Portion = 0;
  let tier3Portion = 0;

  if (shots > PRICING.TIER_2_LIMIT) {
    // Acima de 80.000: todo o excedente (acima de 20.000) vai para a taxa menor.
    tier3Portion = excess;
  } else if (shots > PRICING.FLAT_PACKAGE_LIMIT) {
    // Entre 20.001 e 80.000: todo o excedente vai para a taxa intermediária.
    tier2Portion = excess;
  }

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
  const cases = [15_000, 20_000, 20_001, 50_000, 70_000, 80_000, 90_000, 100_000];
  for (const shots of cases) {
    const r = calculateRentalValue(shots);
    console.log(
      `${shots.toLocaleString("pt-BR")} disparos -> R$ ${r.totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
    );
  }
}
