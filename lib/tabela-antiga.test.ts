import { describe, expect, it } from "vitest";
import { calcularLocacao, calcularTabelaAntiga, valorTotalDaTabela } from "./rental-pricing";

describe("tabela antiga", () => {
  it("faixa 1: até 40.000 a R$0,12 mais aluguel", () => {
    const b = calcularTabelaAntiga(30_000);
    expect(b.antiga).toMatchObject({ faixa: 1, taxa: 0.12, aluguel: 497, disparosCobrados: 30_000, minimoAplicado: false });
    expect(b.totalValue).toBe(3600);
    expect(valorTotalDaTabela(b)).toBe(4097);
  });
  it("taxa da faixa vale sobre todos os disparos", () => {
    const b = calcularTabelaAntiga(50_000);
    expect(b.totalValue).toBe(5000);
    expect(valorTotalDaTabela(b)).toBe(5497);
  });
  it("limites das faixas", () => {
    expect(calcularTabelaAntiga(40_000).antiga?.faixa).toBe(1);
    expect(calcularTabelaAntiga(40_001).antiga?.faixa).toBe(2);
    expect(calcularTabelaAntiga(80_000).antiga?.faixa).toBe(2);
    expect(calcularTabelaAntiga(80_001).antiga?.faixa).toBe(3);
  });
  it("acima de 80.000: R$0,08 e isento do aluguel", () => {
    const b = calcularTabelaAntiga(90_000);
    expect(b.antiga).toMatchObject({ faixa: 3, taxa: 0.08, aluguel: 0 });
    expect(valorTotalDaTabela(b)).toBe(7200);
  });
  it("mínimo de 15.000", () => {
    const b = calcularTabelaAntiga(10_000);
    expect(b.antiga).toMatchObject({ disparosCobrados: 15_000, minimoAplicado: true });
    expect(valorTotalDaTabela(b)).toBe(497 + 1800);
  });
  it("calcularLocacao escolhe a tabela", () => {
    expect(calcularLocacao(70_000).antiga).toBeUndefined();
    expect(calcularLocacao(70_000).totalValue).toBe(7500);
    expect(calcularLocacao(70_000, undefined, true).totalValue).toBe(7000);
  });
});
