// Tela do assistente: conversão do histórico guardado (formato da API, com
// as consultas no meio) para as bolhas da tela, e um markdown mínimo.

import type { ColunaPlanilha, TipoColuna } from "./planilha-xlsx";

export type MensagemWhatsApp = { client_id: string; nome: string; telefone: string; texto: string };
export type ColunaPedida = { campo: string; titulo: string; tipo?: string; total?: boolean };
export type PlanilhaPedida = {
  titulo: string;
  sql: string;
  colunas: ColunaPedida[];
  grafico?: { titulo?: string; categoria: string; valor: string; tipo?: string };
  linhas: number;
};
export type ItemAgenda = { client_id: string; nome: string; telefone: string; texto: string; ultimo_envio: string | null };
export type AgendaPedida = { inicio: string; fim: string; itens: ItemAgenda[] };
export type Bolha = {
  papel: "eu" | "ia";
  texto: string;
  whatsapp?: MensagemWhatsApp[];
  planilhas?: PlanilhaPedida[];
  agendas?: AgendaPedida[];
};

type BlocoGuardado = {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: { client_id?: string; texto?: string; inicio?: string; fim?: string; itens?: { client_id?: string; texto?: string }[] } & Partial<
    Omit<PlanilhaPedida, "linhas">
  >;
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
  let planilhasPendentes: PlanilhaPedida[] = [];
  let agendasPendentes: AgendaPedida[] = [];
  const pedidosAgenda = new Map<string, { inicio: string; fim: string; textos: Map<string, string> }>();
  const pedidosWhats = new Map<string, { client_id: string; texto: string }>();
  const pedidosPlanilha = new Map<string, Omit<PlanilhaPedida, "linhas">>();
  const fecharResposta = () => {
    if (respostaPendente.trim() || whatsPendentes.length || planilhasPendentes.length || agendasPendentes.length) {
      bolhas.push({
        papel: "ia",
        texto: respostaPendente.trim(),
        ...(whatsPendentes.length ? { whatsapp: whatsPendentes } : {}),
        ...(planilhasPendentes.length ? { planilhas: planilhasPendentes } : {}),
        ...(agendasPendentes.length ? { agendas: agendasPendentes } : {}),
      });
    }
    respostaPendente = "";
    whatsPendentes = [];
    planilhasPendentes = [];
    agendasPendentes = [];
  };
  for (const m of mensagens ?? []) {
    if (m.role === "user" && typeof m.content === "string") {
      fecharResposta();
      bolhas.push({ papel: "eu", texto: m.content });
    } else if (m.role === "user" && Array.isArray(m.content)) {
      for (const b of m.content) {
        const agenda = b.type === "tool_result" && b.tool_use_id ? pedidosAgenda.get(b.tool_use_id) : undefined;
        if (agenda && !b.is_error && typeof b.content === "string") {
          try {
            const r = JSON.parse(b.content);
            if (r?.ok && Array.isArray(r.itens)) {
              agendasPendentes.push({
                inicio: agenda.inicio,
                fim: agenda.fim,
                itens: r.itens.map((i: { client_id: string; nome: string; telefone: string; ultimo_envio: string | null }) => ({
                  client_id: i.client_id,
                  nome: i.nome,
                  telefone: i.telefone,
                  ultimo_envio: i.ultimo_envio ?? null,
                  texto: agenda.textos.get(i.client_id) ?? "",
                })),
              });
            }
          } catch {
            // resultado ilegível: sem cartão
          }
          continue;
        }
        const planilha = b.type === "tool_result" && b.tool_use_id ? pedidosPlanilha.get(b.tool_use_id) : undefined;
        if (planilha && !b.is_error && typeof b.content === "string") {
          try {
            const r = JSON.parse(b.content);
            if (r?.ok) planilhasPendentes.push({ ...planilha, linhas: Number(r.linhas) || 0 });
          } catch {
            // resultado ilegível: sem botão
          }
          continue;
        }
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
        if (b.type === "tool_use" && b.name === "preparar_envio_agenda" && b.id && b.input?.inicio && Array.isArray(b.input.itens)) {
          pedidosAgenda.set(b.id, {
            inicio: b.input.inicio,
            fim: b.input.fim ?? b.input.inicio,
            textos: new Map(b.input.itens.map((i) => [String(i.client_id ?? ""), String(i.texto ?? "")])),
          });
        }
        if (b.type === "tool_use" && b.name === "gerar_planilha" && b.id && b.input?.sql && Array.isArray(b.input.colunas)) {
          pedidosPlanilha.set(b.id, {
            titulo: b.input.titulo ?? "Planilha",
            sql: b.input.sql,
            colunas: b.input.colunas,
            ...(b.input.grafico ? { grafico: b.input.grafico } : {}),
          });
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

const TIPOS: TipoColuna[] = ["texto", "moeda", "data", "inteiro"];

/** "2026-10-15" ou "2026-10-15T10:00:00" vira "15/10/2026" (a planilha transforma em data de verdade). */
function dataBr(v: unknown): string | null {
  const m = typeof v === "string" ? v.match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v == null ? null : String(v);
}

/** Colunas pedidas pela IA no formato da planilha da Harmonize. */
export function colunasDaPlanilha(colunas: ColunaPedida[]): ColunaPlanilha<Record<string, unknown>>[] {
  return colunas.map((c) => {
    const tipo = TIPOS.includes(c.tipo as TipoColuna) ? (c.tipo as TipoColuna) : "texto";
    return {
      titulo: c.titulo,
      tipo,
      total: !!c.total && (tipo === "moeda" || tipo === "inteiro"),
      valor: (l) => {
        const v = l[c.campo];
        if (v == null || v === "") return null;
        if (tipo === "moeda" || tipo === "inteiro") {
          const n = Number(v);
          return Number.isFinite(n) ? n : null;
        }
        if (tipo === "data") return dataBr(v);
        return typeof v === "object" ? JSON.stringify(v) : String(v);
      },
    };
  });
}
