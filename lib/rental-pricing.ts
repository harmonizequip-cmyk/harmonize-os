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
// Configurável (Bloco 1): esses valores agora vivem na tabela
// `settings` do Supabase e são editáveis em Configurações. As
// constantes abaixo (DEFAULT_PRICING) só servem de fallback — para
// telas que ainda não recebem a config carregada, ou se a leitura de
// settings falhar. Toda página que já busca settings deve passar o
// PricingConfig real para calculateRentalValue.
// ============================================================

export interface PricingConfig {
  flatPackageLimit: number; // disparos incluídos no pacote fixo
  flatPackageValue: number; // valor do pacote fixo (R$)
  tier2Limit: number; // até aqui, o excedente todo é a tier2Rate
  tier2Rate: number; // R$/disparo sobre o excedente, faixa (flatPackageLimit, tier2Limit]
  tier3Rate: number; // R$/disparo sobre TODO o excedente, acima de tier2Limit
  minimumShots: number | null;
}

export const DEFAULT_PRICING: PricingConfig = {
  flatPackageLimit: 20_000,
  flatPackageValue: 2500.0,
  tier2Limit: 80_000,
  tier2Rate: 0.1,
  tier3Rate: 0.07,
  // Confirmado: não existe mínimo de disparos por sessão.
  minimumShots: null,
};

// Fallback de taxa de reserva para código que ainda não recebe o valor
// de settings.reservation_fee. Prefira sempre passar o valor real.
export const RESERVATION_FEE = 250.0;

export interface RentalPricingBreakdown {
  shots: number;
  flatPackagePortion: number; // disparos cobertos pelo pacote fixo
  tier2Portion: number; // disparos cobrados a tier2Rate (0 se estiver na faixa 3)
  tier3Portion: number; // disparos cobrados a tier3Rate (0 se estiver na faixa 1 ou 2)
  flatPackageValue: number;
  tier2Value: number;
  tier3Value: number;
  totalValue: number;
  // Carrega a config usada neste cálculo, para quem só tem o breakdown
  // em mãos (ex: montagem do resumo de WhatsApp) conseguir descrever as
  // faixas corretamente sem precisar receber o config de novo.
  config: PricingConfig;
}

export class RentalPricingError extends Error {}

/**
 * Calcula o valor de uma locação HIPRO Day a partir da quantidade de disparos.
 * Lança RentalPricingError se a quantidade for inválida ou abaixo do mínimo
 * (quando config.minimumShots estiver configurado).
 *
 * `config` é opcional e cai em DEFAULT_PRICING quando omitido — sempre que
 * possível, busque o valor real em `settings` (ver lib/settings.ts) e passe
 * aqui, para respeitar o que foi configurado em vez do fallback fixo.
 */
export function calculateRentalValue(shots: number, config: PricingConfig = DEFAULT_PRICING): RentalPricingBreakdown {
  if (!Number.isFinite(shots) || shots <= 0) {
    throw new RentalPricingError("Quantidade de disparos deve ser um número positivo.");
  }
  if (config.minimumShots !== null && shots < config.minimumShots) {
    throw new RentalPricingError(`Quantidade mínima de disparos é ${config.minimumShots.toLocaleString("pt-BR")}.`);
  }

  const flatPackagePortion = Math.min(shots, config.flatPackageLimit);
  const excess = Math.max(0, shots - config.flatPackageLimit);

  let tier2Portion = 0;
  let tier3Portion = 0;

  if (shots > config.tier2Limit) {
    // Acima do limite 2: todo o excedente (acima do pacote fixo) vai para a taxa menor.
    tier3Portion = excess;
  } else if (shots > config.flatPackageLimit) {
    // Entre o pacote fixo e o limite 2: todo o excedente vai para a taxa intermediária.
    tier2Portion = excess;
  }

  const flatPackageValue = config.flatPackageValue;
  const tier2Value = round2(tier2Portion * config.tier2Rate);
  const tier3Value = round2(tier3Portion * config.tier3Rate);

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
    config,
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
