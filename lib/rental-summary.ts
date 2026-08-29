import type { RentalPricingBreakdown } from "./rental-pricing";
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
}

/**
 * Calcula o valor líquido da locação (o que vira a transação "Locação") e o
 * total efetivamente a pagar agora (que também inclui a taxa de reserva
 * quando cobrada nesta mesma locação).
 */
export function calculateTotals(input: RentalChargesInput) {
  const reservationCredit = input.reservationFeeStatus === "ja_paga" ? RESERVATION_FEE : 0;
  const reservationChargeNow = input.reservationFeeStatus === "cobrar_agora" ? RESERVATION_FEE : 0;

  const rentalTransactionAmount = Math.max(
    0,
    input.pricing.totalValue + input.additionalChargeValue - input.discountValue - reservationCredit
  );
  const totalToPayNow = rentalTransactionAmount + reservationChargeNow;

  return { reservationCredit, reservationChargeNow, rentalTransactionAmount, totalToPayNow };
}

export function buildWhatsAppSummary(input: RentalChargesInput): string {
  const { pricing } = input;
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
  lines.push(`  Pacote fixo (até 20.000): ${fmtMoney(pricing.flatPackageValue)}`);
  if (pricing.tier2Portion > 0) {
    lines.push(`  Excedente 20.001–80.000: ${fmtInt(pricing.tier2Portion)} x R$ 0,10 = ${fmtMoney(pricing.tier2Value)}`);
  }
  if (pricing.tier3Portion > 0) {
    lines.push(`  Excedente acima de 80.000: ${fmtInt(pricing.tier3Portion)} x R$ 0,07 = ${fmtMoney(pricing.tier3Value)}`);
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

/**
 * Monta o link wa.me a partir de um número em qualquer formato comum
 * ((83) 90000-0000, 83900000000, etc). Retorna null se o campo estiver vazio.
 */
export function buildWhatsAppLink(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(text)}`;
}
