// Tela do assistente: conversão do histórico guardado (formato da API, com
// as consultas no meio) para as bolhas da tela, e um markdown mínimo.

export type MensagemWhatsApp = { client_id: string; nome: string; telefone: string; texto: string };
export type Bolha = { papel: "eu" | "ia"; texto: string; whatsapp?: MensagemWhatsApp[] };

type BlocoGuardado = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: { client_id?: string; texto?: string };
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
};
type MensagemGuardada = { role: "user" | "assistant"; content: string | BlocoGuardado[] };

/**
 * Uma bolha por pergunta e uma pela resposta final (a última fala da IA antes
 * da próxima pergunta). As mensagens de WhatsApp preparadas na rodada voltam
 * como botões na resposta (o telefone vem no resultado da ferramenta).
 */
export function bolhasDoHistorico(mensagens: MensagemGuardada[]): Bolha[] {
  const bolhas: Bolha[] = [];
  let respostaPendente = "";
  let whatsPendentes: MensagemWhatsApp[] = [];
  const pedidosWhats = new Map<string, { client_id: string; texto: string }>();
  const fecharResposta = () => {
    if (respostaPendente.trim() || whatsPendentes.length) {
      bolhas.push({
        papel: "ia",
        texto: respostaPendente.trim(),
        ...(whatsPendentes.length ? { whatsapp: whatsPendentes } : {}),
      });
    }
    respostaPendente = "";
    whatsPendentes = [];
  };
  for (const m of mensagens ?? []) {
    if (m.role === "user" && typeof m.content === "string") {
      fecharResposta();
      bolhas.push({ papel: "eu", texto: m.content });
    } else if (m.role === "user" && Array.isArray(m.content)) {
      for (const b of m.content) {
        const pedido = b.type === "tool_result" && b.tool_use_id ? pedidosWhats.get(b.tool_use_id) : undefined;
        if (!pedido || b.is_error || typeof b.content !== "string") continue;
        try {
          const r = JSON.parse(b.content);
          if (r?.ok && r.telefone) whatsPendentes.push({ client_id: pedido.client_id, nome: r.nome ?? "", telefone: r.telefone, texto: pedido.texto });
        } catch {
          // resultado sem telefone: sem botão
        }
      }
    } else if (m.role === "assistant" && Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b.type === "tool_use" && b.name === "preparar_whatsapp" && b.id && b.input?.texto) {
          pedidosWhats.set(b.id, { client_id: b.input.client_id ?? "", texto: b.input.texto });
        }
      }
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
