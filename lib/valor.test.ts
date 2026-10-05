import { describe, it, expect } from "vitest";
import { valorParaNumero, numeroParaCampo } from "./valor";

describe("valorParaNumero", () => {
  it("lê vírgula decimal, com e sem ponto de milhar", () => {
    expect(valorParaNumero("1.500,50")).toBe(1500.5);
    expect(valorParaNumero("1500,50")).toBe(1500.5);
    expect(valorParaNumero("150,5")).toBe(150.5);
  });

  it("lê ponto como milhar só quando há grupos de três dígitos", () => {
    expect(valorParaNumero("1.500")).toBe(1500);
    expect(valorParaNumero("12.345.678")).toBe(12345678);
  });

  it("lê ponto como decimal nos outros casos", () => {
    expect(valorParaNumero("1500.50")).toBe(1500.5);
    expect(valorParaNumero("150")).toBe(150);
  });

  it("aceita R$ e espaços, e devolve NaN para texto ilegível", () => {
    expect(valorParaNumero("R$ 1.200,00")).toBe(1200);
    expect(valorParaNumero("")).toBeNaN();
    expect(valorParaNumero("abc")).toBeNaN();
  });
});

describe("numeroParaCampo", () => {
  it("usa vírgula e duas casas", () => {
    expect(numeroParaCampo(1234.5)).toBe("1234,50");
    expect(numeroParaCampo(0)).toBe("0,00");
  });
});
