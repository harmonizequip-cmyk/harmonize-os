// Entrar com a digital (passkey do Supabase Auth). A digital nunca sai do
// celular: o aparelho guarda uma chave e o Supabase só confere a assinatura.

export function digitalSuportada(): boolean {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";
}

/** Traduz os erros mais comuns do Supabase e do navegador. Termina com o
 * código técnico entre parênteses, para dar para saber a causa por um print. */
export function mensagemErroDigital(erro: unknown): string {
  const e = erro as { code?: string; message?: string; name?: string; cause?: { name?: string; message?: string } } | null;
  const codigo = e?.code ?? "";
  const causa = e?.cause?.name ?? "";
  const texto = `${codigo} ${causa} ${e?.name ?? ""} ${e?.message ?? ""} ${e?.cause?.message ?? ""}`.toLowerCase();
  const tecnico = [codigo, causa].filter(Boolean).join(" / ") || e?.name || "";
  const comCodigo = (m: string) => (tecnico ? `${m} (${tecnico})` : m);

  if (codigo === "passkey_disabled" || texto.includes("passkey_disabled"))
    return "A entrada com digital ainda não foi ligada no Supabase (Authentication > Passkeys).";
  if (codigo === "webauthn_credential_exists" || codigo === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED")
    return "Este celular já está cadastrado.";
  if (codigo === "webauthn_credential_not_found")
    return "Esta digital não está cadastrada. Entre com a senha e cadastre em Configurações.";
  if (codigo === "too_many_passkeys") return "Limite de aparelhos cadastrados. Apague um antigo.";
  if (codigo.includes("challenge")) return "Demorou demais. Tente de novo.";
  if (codigo === "ERROR_INVALID_RP_ID" || codigo === "ERROR_INVALID_DOMAIN" || causa === "SecurityError")
    return comCodigo(
      `No Supabase, em Authentication > Passkeys, o Relying Party ID precisa ser ${window.location.hostname} e o Origins ${window.location.origin}.`
    );
  if (codigo === "ERROR_CEREMONY_ABORTED" || texto.includes("cancel")) return "Cancelado.";
  if (causa === "NotAllowedError" || texto.includes("notallowed"))
    return comCodigo("O celular recusou ou o tempo acabou. Tente de novo e confirme com a digital.");
  return comCodigo("Não deu certo com a digital. Tente de novo ou entre com a senha.");
}
