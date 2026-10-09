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

// Quem tocou em "Desligar" não deve ser reinscrito sozinho.
const CHAVE_DESLIGADO = "harmonize-avisos-desligados";

export function marcarAvisosDesligados(desligado: boolean) {
  try {
    if (desligado) localStorage.setItem(CHAVE_DESLIGADO, "1");
    else localStorage.removeItem(CHAVE_DESLIGADO);
  } catch {
    // sem armazenamento: segue sem a marca
  }
}

function desligadoPeloDono(): boolean {
  try {
    return localStorage.getItem(CHAVE_DESLIGADO) === "1";
  } catch {
    return false;
  }
}

type ClienteSupabase = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: (t: string) => any;
};

/**
 * Inscreve este aparelho (ou refaz a inscrição) e grava no banco. Usado ao
 * tocar em "Ativar avisos" e, sozinho, toda vez que o app abre: reinstalar o
 * app ou limpar dados do Chrome mata a inscrição antiga, a função de envio
 * apaga a linha dela no banco, e sem isto os avisos paravam em silêncio.
 * Devolve true se o aparelho ficou inscrito.
 */
export async function garantirInscricao(supabase: ClienteSupabase, forcar = false): Promise<boolean> {
  if (!avisosSuportados() || Notification.permission !== "granted") return false;
  if (!forcar && desligadoPeloDono()) return false;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  let inscricao = await reg.pushManager.getSubscription();

  if (inscricao) {
    const { data } = await supabase.from("push_inscricoes").select("id").eq("endpoint", inscricao.endpoint).maybeSingle();
    if (data) return true;
    // Inscrição que o banco não conhece: pode estar morta. Troca por uma nova.
    await inscricao.unsubscribe().catch(() => {});
    inscricao = null;
  }

  inscricao = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: chaveParaBytes(VAPID_PUBLIC_KEY) as unknown as BufferSource,
  });
  const json = inscricao.toJSON();
  const { error } = await supabase.from("push_inscricoes").upsert(
    {
      user_id: user.id,
      endpoint: inscricao.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      aparelho: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw new Error(error.message);
  return true;
}
