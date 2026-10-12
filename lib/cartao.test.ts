import { describe, it, expect } from "vitest";
import { faturaDaCompra, rotuloFatura, somarMesesRef, foraDoResultadoPorCartao, foraDoSaldoPorCartao } from "./cartao";

describe("cartão", () => {
  it("fatura da compra igual ao banco", () => {
    expect(faturaDaCompra("2026-01-03", 5, 12)).toBe("2026-01");
    expect(faturaDaCompra("2026-01-10", 5, 12)).toBe("2026-02");
    expect(faturaDaCompra("2026-01-20", 25, 5)).toBe("2026-02");
    expect(faturaDaCompra("2026-01-31", 31, 10)).toBe("2026-02");
    expect(faturaDaCompra("2026-02-28", 31, 10)).toBe("2026-03");
    expect(faturaDaCompra("2026-12-28", 25, 5)).toBe("2027-02");
  });
  it("rótulos e meses", () => {
    expect(rotuloFatura("2026-03")).toBe("mar/2026");
    expect(somarMesesRef("2026-12", 1)).toBe("2027-01");
    expect(somarMesesRef("2026-01", -1)).toBe("2025-12");
  });
  it("regras de soma", () => {
    expect(foraDoResultadoPorCartao("pagamento")).toBe(true);
    expect(foraDoResultadoPorCartao("compra")).toBe(false);
    expect(foraDoSaldoPorCartao("compra")).toBe(true);
    expect(foraDoSaldoPorCartao(null)).toBe(false);
  });
});
