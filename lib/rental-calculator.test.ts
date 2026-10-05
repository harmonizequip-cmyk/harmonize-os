import { describe, it, expect } from "vitest";
import { calcularResumoLocacao, type ResumoLocacaoInput } from "./rental-calculator";

function entrada(extra: Partial<ResumoLocacaoInput>): ResumoLocacaoInput {
  return {
    isMentoria: false,
    shots: 100,
    pricing: { totalValue: 2000 } as any,
    custoManualPorDisparo: null,
    mentoriaPricing: null,
    kmIda: 0,
    itens: [],
    reservationFeeStatus: "nao_aplica",
    reservationFee: 250,
    ...extra,
  };
}

describe("resumo da locação e taxa de reserva", () => {
  it("sem taxa: bruto, valor da locação e total a pagar são o mesmo valor", () => {
    const r = calcularResumoLocacao(entrada({}));
    expect(r.valorBruto).toBe(2000);
    expect(r.valorLocacao).toBe(2000);
    expect(r.totalAPagarAgora).toBe(2000);
  });

  it("taxa já paga: grava o bruto (o banco desconta a taxa), mas o cliente paga bruto menos a taxa", () => {
    const r = calcularResumoLocacao(entrada({ reservationFeeStatus: "ja_paga" }));
    expect(r.valorBruto).toBe(2000);
    expect(r.creditoTaxa).toBe(250);
    expect(r.valorLocacao).toBe(1750);
    expect(r.totalAPagarAgora).toBe(1750);
    // Conta do banco: saldo = valor gravado - taxa paga - pagamentos.
    const saldoNoBanco = r.valorBruto - r.creditoTaxa;
    expect(saldoNoBanco).toBe(r.totalAPagarAgora);
  });

  it("taxa cobrada agora: bruto não muda e o total a pagar soma a taxa", () => {
    const r = calcularResumoLocacao(entrada({ reservationFeeStatus: "cobrar_agora" }));
    expect(r.valorBruto).toBe(2000);
    expect(r.valorLocacao).toBe(2000);
    expect(r.totalAPagarAgora).toBe(2250);
  });

  it("deslocamento e ajustes entram no bruto", () => {
    const r = calcularResumoLocacao(
      entrada({
        kmIda: 50,
        itens: [
          { id: "1", desc: "extra", valor: 100, tipo: "mais" },
          { id: "2", desc: "desconto", valor: 50, tipo: "menos" },
        ],
        reservationFeeStatus: "ja_paga",
      })
    );
    expect(r.valorBruto).toBe(2000 + 100 + 100 - 50);
    expect(r.valorLocacao).toBe(r.valorBruto - 250);
  });
});
