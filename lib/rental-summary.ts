import type { RentalPricingBreakdown } from "./rental-pricing";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("pt-BR");
}

export function buildWhatsAppSummary(params: {
  initialCount: number;
  finalCount: number;
  pricing: RentalPricingBreakdown;
  eventDate: string;
  clientName: string;
  paymentMethod: string;
}): string {
  const { initialCount, finalCount, pricing, eventDate, clientName, paymentMethod } = params;

  const lines: string[] = [];
  lines.push("🌿 *HARMONIZE — Resumo de Disparos*");
  lines.push("_Locação de Equipamentos Médicos e Estéticos_");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push("📊 *CONTAGEM DO EQUIPAMENTO*");
  lines.push(`  • Contagem inicial: ${fmtInt(initialCount)}`);
  lines.push(`  • Contagem final:   ${fmtInt(finalCount)}`);
  lines.push(`  • Disparos realizados: *${fmtInt(pricing.shots)}*`);
  lines.push("");
  lines.push("💰 *VALOR DOS DISPAROS*");
  lines.push(`  Pacote fixo (até 20.000): *${fmtMoney(pricing.flatPackageValue)}*`);
  if (pricing.tier2Portion > 0) {
    lines.push(`  Excedente 20.001–80.000: ${fmtInt(pricing.tier2Portion)} x R$ 0,10 = ${fmtMoney(pricing.tier2Value)}`);
  }
  if (pricing.tier3Portion > 0) {
    lines.push(`  Excedente acima de 80.000: ${fmtInt(pricing.tier3Portion)} x R$ 0,07 = ${fmtMoney(pricing.tier3Value)}`);
  }
  lines.push("");
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`💰 *TOTAL A PAGAR: ${fmtMoney(pricing.totalValue)}*`);
  lines.push("━━━━━━━━━━━━━━━━━━━━━");
  lines.push("");
  lines.push(`📅 Data: ${fmtDate(eventDate)}`);
  lines.push(`🏥 Cliente: ${clientName}`);
  lines.push(`💳 Pagamento: ${PAYMENT_LABELS[paymentMethod] ?? paymentMethod}`);
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
