import { describe, it, expect } from "vitest";
import { valorParaNumero, numeroParaCampo, lerCustoPorDisparo, limparCampoCustoPorDisparo } from "./valor";

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

describe("lerCustoPorDisparo", () => {
  it("aceita 3 e 4 casas com vírgula ou ponto", () => {
    expect(lerCustoPorDisparo("0,065")).toBe(0.065);
    expect(lerCustoPorDisparo("0.065")).toBe(0.065);
    expect(lerCustoPorDisparo(",0725")).toBe(0.0725);
    expect(lerCustoPorDisparo("0,07")).toBe(0.07);
  });
  it("só dígitos continua sendo centavos", () => {
    expect(lerCustoPorDisparo("9")).toBe(0.09);
    expect(lerCustoPorDisparo("65")).toBe(0.65);
  });
  it("vazio, zero ou lixo dá null", () => {
    expect(lerCustoPorDisparo("")).toBeNull();
    expect(lerCustoPorDisparo("0,")).toBeNull();
    expect(lerCustoPorDisparo(",")).toBeNull();
  });
});

describe("limparCampoCustoPorDisparo", () => {
  it("deixa dígitos e uma vírgula, até 4 casas", () => {
    expect(limparCampoCustoPorDisparo("0.065")).toBe("0,065");
    expect(limparCampoCustoPorDisparo("0,06555")).toBe("0,0655");
    expect(limparCampoCustoPorDisparo("R$ 0,0,6")).toBe("0,06");
  });
});
