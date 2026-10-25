import { describe, expect, it } from "vitest";
import { ROTULO_ORIGEM_ANOTACAO, origemDaAnotacao } from "./anotacoes";

describe("origemDaAnotacao", () => {
  it("reconhece as quatro origens", () => {
    expect(origemDaAnotacao("digitada")).toBe("digitada");
    expect(origemDaAnotacao("voz")).toBe("voz");
    expect(origemDaAnotacao("assistente")).toBe("assistente");
    expect(origemDaAnotacao("campanha")).toBe("campanha");
  });

  it("valor estranho ou vazio vira digitada", () => {
    expect(origemDaAnotacao("xyz")).toBe("digitada");
    expect(origemDaAnotacao("toString")).toBe("digitada");
    expect(origemDaAnotacao(null)).toBe("digitada");
    expect(origemDaAnotacao(undefined)).toBe("digitada");
    expect(origemDaAnotacao("")).toBe("digitada");
  });

  it("campanha tem o rótulo Campanha", () => {
    expect(ROTULO_ORIGEM_ANOTACAO.campanha).toBe("Campanha");
  });
});
