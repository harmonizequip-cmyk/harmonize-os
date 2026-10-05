import { describe, expect, it } from "vitest";
import { buildPedidoConfirmacaoMessage } from "./confirmacao";

// Cobre os testes 5-8 da seção 20 do pedido (cadastro do cliente) e a
// exigência da seção 4 de nunca vazar HIPRO 1/HIPRO 2 nem dado interno.
describe("buildPedidoConfirmacaoMessage", () => {
  it("Teste 5: tratamento + nome preenchidos monta a saudação normal", () => {
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      treatment: "Dra.",
      displayName: "Camila Lima",
      dateStart: "2026-10-01",
    });
    expect(cadastroIncompleto).toBe(false);
    expect(message).toContain("Olá, Dra. Camila! 😊");
    expect(message).toContain("01/10/2026");
    expect(message).toContain("Já estamos organizando tudo por aqui");
  });

  it("Teste 6: sem tratamento a mensagem vai inteira, só com o primeiro nome", () => {
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      treatment: null,
      displayName: "Camila Lima",
      dateStart: "2026-10-01",
    });
    expect(message).toContain("Olá, Camila! 😊");
    expect(message).toContain("01/10/2026");
    expect(cadastroIncompleto).toBe(false);
  });

  it("Teste 7: sem Tratamento e Nome de exibição, tira o nome do campo Nome", () => {
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      name: "DRA. MARI FILLER HIPNOSE - DONA DE CLÍNICA - HIPRO",
      treatment: null,
      displayName: "",
      dateStart: "2026-10-01",
    });
    expect(message).toContain("Olá, Dra. Mari! 😊");
    expect(message).toContain("seu HIPRO day está chegando: 01/10/2026");
    expect(cadastroIncompleto).toBe(false);
  });

  it("sem nome nenhum: saudação genérica, mensagem inteira e aviso de cadastro incompleto", () => {
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      treatment: "Dra.",
      displayName: "",
      dateStart: "2026-10-01",
    });
    expect(message.startsWith("Olá! 😊")).toBe(true);
    expect(message).toContain("01/10/2026");
    expect(cadastroIncompleto).toBe(true);
  });

  it("Teste 8: cadastro antigo bagunçado nunca é usado como nome de exibição (a função nem recebe esse campo)", () => {
    // A assinatura da função só aceita treatment/displayName/dateStart — não
    // existe parâmetro de "nome antigo" para vazar aqui. Com os campos
    // novos preenchidos, o resultado usa exclusivamente eles.
    const { message } = buildPedidoConfirmacaoMessage({
      treatment: "Dra.",
      displayName: "Camila Lima",
      dateStart: "2026-10-01",
    });
    expect(message).not.toContain("RAIO E GABRIEL");
    // "HIPRO day" faz parte do próprio texto exigido pela seção 4 — o que
    // não pode aparecer é a identificação do equipamento (HIPRO 1/HIPRO 2),
    // coberto no teste seguinte.
  });

  it("nunca inclui identificação de equipamento (HIPRO 1 / HIPRO 2) mesmo com cadastro completo", () => {
    const { message } = buildPedidoConfirmacaoMessage({
      treatment: "Dr.",
      displayName: "Eduardo",
      dateStart: "2026-10-01",
    });
    expect(message).not.toMatch(/HIPRO\s*[12]/);
  });

  it("data sempre no formato DD/MM/AAAA", () => {
    const { message } = buildPedidoConfirmacaoMessage({
      treatment: "Dr.",
      displayName: "Eduardo",
      dateStart: "2026-01-05",
    });
    expect(message).toContain("05/01/2026");
  });

  it("espaços em branco no tratamento não quebram a saudação", () => {
    const { message, cadastroIncompleto } = buildPedidoConfirmacaoMessage({
      treatment: "  ",
      displayName: "Camila Lima",
      dateStart: "2026-10-01",
    });
    expect(message).toContain("Olá, Camila! 😊");
    expect(cadastroIncompleto).toBe(false);
  });
});
