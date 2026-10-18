// Erro da Edge Function `assistente`: usa o texto que ela devolveu em `erro`
// (limite do mês, permissão...) e, sem ele, a mensagem padrão de quem chamou.
export async function mensagemDeErro(
  error: unknown,
  padrao = "Não consegui falar com o assistente. Confira a internet e tente de novo."
): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const corpo = await ctx.json();
      if (corpo?.erro) return corpo.erro;
    } catch {
      // segue para a mensagem genérica
    }
  }
  return padrao;
}
