// "Esqueci minha senha" (18/11/2026). O e-mail de redefinição leva a /redefinir-senha.
// Usa o fluxo implícito (token no endereço, depois do #), que funciona mesmo quando a
// pessoa abre o e-mail em outro aparelho ou navegador; o fluxo padrão do app (PKCE)
// só funcionaria no mesmo navegador em que o pedido foi feito.

import { createClient as criarClienteSupabase } from "@supabase/supabase-js";

export const CAMINHO_REDEFINIR = "/redefinir-senha";

/** Cliente só para recuperar senha: não guarda sessão, para não deixar a pessoa logada sem querer. */
export function clienteDeRecuperacao() {
  return criarClienteSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: true },
  });
}

/** O endereço (a parte depois do #) é de um link de recuperação de senha? */
export function ehLinkDeRecuperacao(hash: string): boolean {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  return p.get("type") === "recovery" && !!p.get("access_token");
}

/** Erro que o Supabase põe no endereço quando o link venceu ou já foi usado. */
export function erroDoLink(hash: string): string | null {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  if (!p.get("error")) return null;
  return p.get("error_code") === "otp_expired"
    ? "Este link venceu ou já foi usado. Peça um novo na tela de entrada."
    : "Não foi possível abrir este link. Peça um novo na tela de entrada.";
}
