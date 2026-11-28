import { describe, expect, it } from "vitest";
import { lerCupons, normalizarCupom, rotuloCupomImagem, rotuloDesconto } from "./cupons";

describe("cupons", () => {
  it("rótulo com cupom e sem cupom", () => {
    expect(rotuloDesconto("percentual", 15, "black friday")).toBe("Cupom BLACK FRIDAY (15%)");
    expect(rotuloDesconto("percentual", 10, "INDICAÇÃO")).toBe("Cupom INDICAÇÃO (10%)");
    expect(rotuloDesconto("percentual", 12.5, "")).toBe("12,5% de desconto");
    expect(rotuloDesconto("valor", 0, "natal")).toBe("Cupom NATAL");
    expect(rotuloDesconto("valor", 0, null)).toBe("Desconto");
  });
  it("na imagem o percentual sai do nome", () => {
    expect(rotuloCupomImagem("Cupom BLACK FRIDAY (15%)")).toBe("Cupom BLACK FRIDAY");
    expect(rotuloCupomImagem("15% de desconto")).toBeNull();
  });
  it("nome normalizado", () => {
    expect(normalizarCupom("  black   friday ")).toBe("BLACK FRIDAY");
  });
  it("lista de Configurações: padrão quando não há, válidos sem repetir", () => {
    const padrao = [{ nome: "BLACK FRIDAY", percentual: 15 }];
    expect(lerCupons(undefined, padrao)).toEqual(padrao);
    expect(lerCupons([{ nome: "natal", percentual: 5 }, { nome: "NATAL", percentual: 8 }, { nome: "", percentual: 3 }, { nome: "x", percentual: 0 }], padrao)).toEqual([
      { nome: "NATAL", percentual: 5 },
    ]);
    expect(lerCupons([], padrao)).toEqual([]);
  });
});
