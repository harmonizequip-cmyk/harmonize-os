// Avisos no celular (web push). A chave pública de envio pode ficar no código:
// ela só identifica o Harmonize para o serviço de entrega do navegador. A chave
// privada correspondente fica no cofre do Supabase (função alertas).
export const VAPID_PUBLIC_KEY = "BHKPTBT935k49O-6dnrhtF9lwBDNnKU5k45Jl20NiHFa5oxrJESXamLGBIQI6oWH3mjr8Ah2uekyQXUg2-d3UNA";

/** Converte a chave em base64url para o formato que o navegador pede. */
export function chaveParaBytes(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = atob(base64);
  const saida = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
  return saida;
}

export function avisosSuportados(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}
