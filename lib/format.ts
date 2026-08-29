export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  return d.toLocaleDateString("pt-BR");
}

/**
 * Monta o link que abre o endereço direto no Google Maps (app se instalado,
 * senão o navegador). Retorna null se o endereço estiver vazio.
 */
export function buildMapsLink(address: string | null | undefined): string | null {
  if (!address || !address.trim()) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
}

/**
 * Monta o link que abre o endereço direto no Waze (app se instalado,
 * senão o navegador). Retorna null se o endereço estiver vazio.
 */
export function buildWazeLink(address: string | null | undefined): string | null {
  if (!address || !address.trim()) return null;
  return `https://waze.com/ul?q=${encodeURIComponent(address.trim())}&navigate=yes`;
}

/**
 * Monta o link do WhatsApp a partir de um número em qualquer formato comum
 * ((83) 90000-0000, 83900000000, etc). Sempre garante o código do país (55),
 * sem o qual o wa.me não reconhece o número corretamente. Retorna null se o
 * campo estiver vazio. O parâmetro "text" é opcional (mensagem pré-preenchida).
 */
export function buildWhatsAppLink(phone: string | null | undefined, text?: string): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  // Remove um eventual "0" de discagem nacional antes do DDD
  // (ex: "083999998888" -> "83999998888"), que senão faria o país
  // ficar grudado errado: "55083999998888" em vez de "5583999998888".
  if (!digits.startsWith("55") && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  const withCountryCode = digits.startsWith("55") ? digits : `55${digits}`;
  return text ? `https://wa.me/${withCountryCode}?text=${encodeURIComponent(text)}` : `https://wa.me/${withCountryCode}`;
}
