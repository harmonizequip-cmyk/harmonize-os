// Regra de senha do Supabase Auth (Authentication > Providers > Email, 16/10/2026):
// no mínimo 8 caracteres, com letra minúscula, letra maiúscula e número.
// Mudou lá, mudar aqui.
export const REGRA_SENHA = "Pelo menos 8 caracteres, com letra minúscula, letra maiúscula e número.";

/** Mensagem do que falta na senha, ou null se ela passa na regra. */
export function problemaSenha(senha: string): string | null {
  if (senha.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[a-z]/.test(senha)) return "A senha precisa ter pelo menos uma letra minúscula.";
  if (!/[A-Z]/.test(senha)) return "A senha precisa ter pelo menos uma letra maiúscula.";
  if (!/\d/.test(senha)) return "A senha precisa ter pelo menos um número.";
  return null;
}
