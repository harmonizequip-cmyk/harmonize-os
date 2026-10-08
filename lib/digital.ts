// Entrar com a digital (passkey do Supabase Auth). A digital nunca sai do
// celular: o aparelho guarda uma chave e o Supabase só confere a assinatura.

export function digitalSuportada(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** Traduz os erros mais comuns do Supabase e do navegador. */
export function mensagemErroDigital(erro: unknown): string {
  const e = erro as { code?: string; message?: string; name?: string } | null;
  const codigo = e?.code ?? "";
  const texto = `${codigo} ${e?.name ?? ""} ${e?.message ?? ""}`.toLowerCase();
  if (codigo === "passkey_disabled" || texto.includes("passkey_disabled"))
    return "A entrada com digital ainda não foi ligada no Supabase (Authentication > Passkeys).";
  if (codigo === "webauthn_credential_exists") return "Este celular já está cadastrado.";
  if (codigo === "webauthn_credential_not_found")
    return "Esta digital não está cadastrada. Entre com a senha e cadastre em Configurações.";
  if (codigo === "too_many_passkeys") return "Limite de aparelhos cadastrados. Apague um antigo.";
  if (codigo.includes("challenge")) return "Demorou demais. Tente de novo.";
  if (texto.includes("notallowed") || texto.includes("cancel") || texto.includes("aborted"))
    return "Cancelado.";
  return "Não deu certo com a digital. Tente de novo ou entre com a senha.";
}
