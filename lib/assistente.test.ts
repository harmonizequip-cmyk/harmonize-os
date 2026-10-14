import { describe, expect, it } from "vitest";
import { bolhasDoHistorico, colunasDaPlanilha, trechosMarkdown } from "./assistente";
import { textoParaFala } from "./falar";

describe("bolhasDoHistorico", () => {
  it("mostra a pergunta e só a resposta final de cada rodada, sem as consultas", () => {
    const b = bolhasDoHistorico([
      { role: "user", content: "quem me deve?" },
      { role: "assistant", content: [{ type: "text", text: "Vou ver." }, { type: "tool_use" }] },
      { role: "user", content: [{ type: "tool_result" }] },
      { role: "assistant", content: [{ type: "text", text: "A Dra. Ana deve R$ 500,00." }] },
      { role: "user", content: "e a Luci?" },
      { role: "assistant", content: [{ type: "text", text: "Não deve nada." }] },
    ]);
    expect(b).toEqual([
      { papel: "eu", texto: "quem me deve?" },
      { papel: "ia", texto: "A Dra. Ana deve R$ 500,00." },
      { papel: "eu", texto: "e a Luci?" },
      { papel: "ia", texto: "Não deve nada." },
    ]);
  });
});

describe("bolhasDoHistorico com WhatsApp", () => {
  it("remonta o botão do WhatsApp a partir da ferramenta e do resultado", () => {
    const b = bolhasDoHistorico([
      { role: "user", content: "responde a Ana" },
      { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "preparar_whatsapp", input: { client_id: "c1", texto: "Olá, Dra. Ana!" } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: '{"ok":true,"nome":"Dra. Ana","telefone":"83999990000"}' }] },
      { role: "assistant", content: [{ type: "text", text: "Pronto." }] },
    ]);
    expect(b[1]).toEqual({
      papel: "ia",
      texto: "Pronto.",
      whatsapp: [{ client_id: "c1", nome: "Dra. Ana", telefone: "83999990000", texto: "Olá, Dra. Ana!" }],
    });
  });
});

describe("planilha do assistente", () => {
  it("remonta o botão da planilha do histórico", () => {
    const b = bolhasDoHistorico([
      { role: "user", content: "planilha de quem deve" },
      { role: "assistant", content: [{ type: "tool_use", id: "p1", name: "gerar_planilha", input: { titulo: "Devendo", sql: "select 1", colunas: [{ campo: "a", titulo: "A" }] } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "p1", content: '{"ok":true,"linhas":7}' }] },
      { role: "assistant", content: [{ type: "text", text: "Pronto." }] },
    ]);
    expect(b[1].planilhas).toEqual([{ titulo: "Devendo", sql: "select 1", colunas: [{ campo: "a", titulo: "A" }], linhas: 7 }]);
  });

  it("converte datas, valores e só soma número", () => {
    const cols = colunasDaPlanilha([
      { campo: "cliente", titulo: "Cliente" },
      { campo: "dia", titulo: "Data", tipo: "data" },
      { campo: "valor", titulo: "Valor", tipo: "moeda", total: true },
      { campo: "obs", titulo: "Obs", total: true },
    ]);
    const l = { cliente: "Ana", dia: "2026-10-15", valor: "1200.5", obs: null };
    expect(cols.map((c) => c.valor(l))).toEqual(["Ana", "15/10/2026", 1200.5, null]);
    expect(cols.map((c) => c.total)).toEqual([false, false, true, false]);
  });
});

describe("trechosMarkdown", () => {
  it("separa itens de lista e negrito", () => {
    const t = trechosMarkdown("Resumo:\n- **Ana**: R$ 500\n2. Bia");
    expect(t[0]).toEqual({ tipo: "paragrafo", partes: [{ texto: "Resumo:", negrito: false }] });
    expect(t[1].tipo).toBe("item");
    expect(t[1].partes[0]).toEqual({ texto: "Ana", negrito: true });
    expect(t[2]).toEqual({ tipo: "item", partes: [{ texto: "Bia", negrito: false }] });
  });
});

describe("textoParaFala", () => {
  it("tira marcação antes de ler em voz alta", () => {
    expect(textoParaFala("**Total**: R$1.200\n- Ana\n- Bia")).toBe("Total: R$ 1.200. Ana. Bia");
  });
});
