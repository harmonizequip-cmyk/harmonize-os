import type { RentalPricingBreakdown, MentoriaPricingBreakdown } from "./rental-pricing";
import { RESERVATION_FEE } from "./rental-pricing";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

export type ReservationFeeStatus = "nao_aplica" | "ja_paga" | "cobrar_agora";

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtRate(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("pt-BR");
}

export interface RentalChargesInput {
  initialCount: number;
  finalCount: number;
  pricing: RentalPricingBreakdown;
  additionalChargeValue: number;
  additionalChargeDescription: string;
  discountValue: number;
  discountDescription: string;
  reservationFeeStatus: ReservationFeeStatus;
  eventDate: string;
  clientName: string;
  paymentMethod: string;
  // Taxa de reserva real (settings.reservation_fee). Opcional por
  // compatibilidade: quem não passar cai no fallback fixo de
  // rental-pricing.ts, mas o certo é sempre passar o valor de settings.
  reservationFee?: number;
}

/**
 * Calcula o valor líquido da locação (o que vira a transação "Locação") e o
 * total efetivamente a pagar agora (que também inclui a taxa de reserva
 * quando cobrada nesta mesma locação).
 */
export function calculateTotals(input: RentalChargesInput) {
  const fee = input.reservationFee ?? RESERVATION_FEE;
  const reservationCredit = input.reservationFeeStatus === "ja_paga" ? fee : 0;
  const reservationChargeNow = input.reservationFeeStatus === "cobrar_agora" ? fee : 0;

  const rentalTransactionAmount = Math.max(
    0,
    input.pricing.totalValue + input.additionalChargeValue - input.discountValue - reservationCredit
  );
  const totalToPayNow = rentalTransactionAmount + reservationChargeNow;

  return { reservationCredit, reservationChargeNow, rentalTransactionAmount, totalToPayNow };
}

export function buildWhatsAppSummary(input: RentalChargesInput): string {
  const { pricing } = input;
  const { config } = pricing;
  const { reservationCredit, reservationChargeNow, totalToPayNow } = calculateTotals(input);

  const lines: string[] = [];
  lines.push("🌿 *HARMONIZE — Resumo de Disparos*");
  lines.push("_Locação de Equipamentos Médicos e Estéticos_");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("📊 *CONTAGEM DO EQUIPAMENTO*");
  lines.push(`  • Contagem inicial: ${fmtInt(input.initialCount)}`);
  lines.push(`  • Contagem final:   ${fmtInt(input.finalCount)}`);
  lines.push(`  • Disparos realizados: *${fmtInt(pricing.shots)}*`);
  lines.push("");
  lines.push("💡 *VALOR DOS DISPAROS*");
  lines.push(`  Pacote fixo (até ${fmtInt(config.flatPackageLimit)}): ${fmtMoney(pricing.flatPackageValue)}`);
  if (pricing.tier2Portion > 0) {
    lines.push(
      `  Excedente ${fmtInt(config.flatPackageLimit + 1)}–${fmtInt(config.tier2Limit)}: ${fmtInt(pricing.tier2Portion)} x R$ ${fmtRate(config.tier2Rate)} = ${fmtMoney(pricing.tier2Value)}`
    );
  }
  if (pricing.tier3Portion > 0) {
    lines.push(
      `  Excedente acima de ${fmtInt(config.tier2Limit)}: ${fmtInt(pricing.tier3Portion)} x R$ ${fmtRate(config.tier3Rate)} = ${fmtMoney(pricing.tier3Value)}`
    );
  }
  lines.push(`  ▸ *Subtotal disparos: ${fmtMoney(pricing.totalValue)}*`);

  if (input.additionalChargeValue > 0) {
    lines.push("");
    lines.push("➕ *COBRANÇAS ADICIONAIS*");
    lines.push(`  • ${input.additionalChargeDescription || "Cobrança adicional"}: + ${fmtMoney(input.additionalChargeValue)}`);
  }

  if (input.discountValue > 0) {
    lines.push("");
    lines.push("➖ *DESCONTOS*");
    lines.push(`  • ${input.discountDescription || "Desconto"}: - ${fmtMoney(input.discountValue)}`);
  }

  if (reservationCredit > 0) {
    lines.push("");
    lines.push("💳 *TAXA DE RESERVA*");
    lines.push(`  • Já paga anteriormente: - ${fmtMoney(reservationCredit)} (creditado)`);
  }

  if (reservationChargeNow > 0) {
    lines.push("");
    lines.push("💳 *TAXA DE RESERVA*");
    lines.push(`  • A pagar agora: + ${fmtMoney(reservationChargeNow)}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`💰 *TOTAL A PAGAR: ${fmtMoney(totalToPayNow)}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`📅 Data: ${fmtDate(input.eventDate)}`);
  lines.push(`🏥 Cliente: ${input.clientName}`);
  lines.push(`💳 Pagamento: ${PAYMENT_LABELS[input.paymentMethod] ?? input.paymentMethod}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

// ------------------------------------------------------------
// Mentoria: mesma mecânica de adicional/desconto/taxa de reserva do
// fluxo de disparos acima, mas com base de cálculo e texto do resumo
// próprios — não é "disparos com preço diferente", é outro produto
// (cobrança por paciente modelo). Por isso não reaproveita
// RentalChargesInput/calculateTotals/buildWhatsAppSummary: o texto de
// lá fala de "disparos", "pacote fixo" etc., que não fazem sentido
// numa mentoria, e forçar os dois num só só confundiria as duas coisas
// de novo, exatamente o que is_mentoria foi criado para separar.
// ------------------------------------------------------------

export interface MentoriaChargesInput {
  pricing: MentoriaPricingBreakdown;
  additionalChargeValue: number;
  additionalChargeDescription: string;
  discountValue: number;
  discountDescription: string;
  reservationFeeStatus: ReservationFeeStatus;
  eventDate: string;
  clientName: string;
  paymentMethod: string;
  reservationFee?: number;
}

export function calculateMentoriaTotals(input: MentoriaChargesInput) {
  const fee = input.reservationFee ?? RESERVATION_FEE;
  const reservationCredit = input.reservationFeeStatus === "ja_paga" ? fee : 0;
  const reservationChargeNow = input.reservationFeeStatus === "cobrar_agora" ? fee : 0;

  const rentalTransactionAmount = Math.max(
    0,
    input.pricing.totalValue + input.additionalChargeValue - input.discountValue - reservationCredit
  );
  const totalToPayNow = rentalTransactionAmount + reservationChargeNow;

  return { reservationCredit, reservationChargeNow, rentalTransactionAmount, totalToPayNow };
}

export function buildMentoriaWhatsAppSummary(input: MentoriaChargesInput): string {
  const { pricing } = input;
  const { reservationCredit, reservationChargeNow, totalToPayNow } = calculateMentoriaTotals(input);

  const lines: string[] = [];
  lines.push("🌿 *HARMONIZE — Resumo de Mentoria*");
  lines.push("_Mentoria HIPRO_");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("👥 *PACIENTES MODELO*");
  lines.push(`  • Quantidade: ${fmtInt(pricing.patientCount)}`);
  lines.push(
    `  • Valor por paciente${pricing.isParcelado ? " (parcelado no crédito até 10x)" : " (à vista)"}: ${fmtMoney(
      pricing.unitValue
    )}`
  );
  lines.push(`  ▸ *Subtotal mentoria: ${fmtMoney(pricing.totalValue)}*`);

  if (input.additionalChargeValue > 0) {
    lines.push("");
    lines.push("➕ *COBRANÇAS ADICIONAIS*");
    lines.push(`  • ${input.additionalChargeDescription || "Cobrança adicional"}: + ${fmtMoney(input.additionalChargeValue)}`);
  }

  if (input.discountValue > 0) {
    lines.push("");
    lines.push("➖ *DESCONTOS*");
    lines.push(`  • ${input.discountDescription || "Desconto"}: - ${fmtMoney(input.discountValue)}`);
  }

  if (reservationCredit > 0) {
    lines.push("");
    lines.push("💳 *TAXA DE RESERVA*");
    lines.push(`  • Já paga anteriormente: - ${fmtMoney(reservationCredit)} (creditado)`);
  }

  if (reservationChargeNow > 0) {
    lines.push("");
    lines.push("💳 *TAXA DE RESERVA*");
    lines.push(`  • A pagar agora: + ${fmtMoney(reservationChargeNow)}`);
  }

  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`💰 *TOTAL A PAGAR: ${fmtMoney(totalToPayNow)}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`📅 Data: ${fmtDate(input.eventDate)}`);
  lines.push(`🏥 Cliente/mentorando: ${input.clientName}`);
  lines.push(`💳 Pagamento: ${PAYMENT_LABELS[input.paymentMethod] ?? input.paymentMethod}`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

// Reexporta a versão central (evita duas implementações divergentes do +55)
export { buildWhatsAppLink } from "./format";
