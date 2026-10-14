// Tela do assistente: conversão do histórico guardado (formato da API, com
// as consultas no meio) para as bolhas da tela, e um markdown mínimo.

export type Bolha = { papel: "eu" | "ia"; texto: string };

type BlocoGuardado = { type: string; text?: string };
type MensagemGuardada = { role: "user" | "assistant"; content: string | BlocoGuardado[] };

/** Uma bolha por pergunta e uma pela resposta final (a última fala da IA antes da próxima pergunta). */
export function bolhasDoHistorico(mensagens: MensagemGuardada[]): Bolha[] {
  const bolhas: Bolha[] = [];
  let respostaPendente = "";
  const fecharResposta = () => {
    if (respostaPendente.trim()) bolhas.push({ papel: "ia", texto: respostaPendente.trim() });
    respostaPendente = "";
  };
  for (const m of mensagens ?? []) {
    if (m.role === "user" && typeof m.content === "string") {
      fecharResposta();
      bolhas.push({ papel: "eu", texto: m.content });
    } else if (m.role === "assistant" && Array.isArray(m.content)) {
      const texto = m.content
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (texto) respostaPendente = texto;
    }
  }
  fecharResposta();
  return bolhas;
}

export type Trecho = { tipo: "paragrafo" | "item"; partes: { texto: string; negrito: boolean }[] };

/** Markdown mínimo: parágrafos, itens de lista (-, •, 1.) e **negrito**. */
export function trechosMarkdown(texto: string): Trecho[] {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const trechos: Trecho[] = [];
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (!linha) continue;
    const item = linha.match(/^(?:[-•*]|\d+[.)])\s+(.*)$/);
    const conteudo = (item ? item[1] : linha).replace(/^#+\s*/, "");
    const partes = conteudo
      .split(/(\*\*[^*]+\*\*)/g)
      .filter(Boolean)
      .map((p) => (p.startsWith("**") && p.endsWith("**") ? { texto: p.slice(2, -2), negrito: true } : { texto: p, negrito: false }));
    trechos.push({ tipo: item ? "item" : "paragrafo", partes });
  }
  return trechos;
}
