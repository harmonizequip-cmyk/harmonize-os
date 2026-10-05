import { describe, it, expect } from "vitest";
import {
  calcularResumoLocacao,
  descontarTaxaDosPagamentos,
  ordenarContagens,
  valorDosDisparos,
  type ResumoLocacaoInput,
} from "./rental-calculator";

function entrada(extra: Partial<ResumoLocacaoInput>): ResumoLocacaoInput {
  return {
    isMentoria: false,
    shots: 100,
    pricing: { totalValue: 2500 } as any,
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
    expect(r.valorBruto).toBe(2500);
    expect(r.valorLocacao).toBe(2500);
    expect(r.totalAPagarAgora).toBe(2500);
  });

  it("taxa já paga: grava o bruto (o banco desconta a taxa), mas o cliente paga bruto menos a taxa", () => {
    const r = calcularResumoLocacao(entrada({ reservationFeeStatus: "ja_paga" }));
    expect(r.valorBruto).toBe(2500);
    expect(r.creditoTaxa).toBe(250);
    expect(r.valorLocacao).toBe(2250);
    expect(r.totalAPagarAgora).toBe(2250);
    // Conta do banco: saldo = valor gravado - taxa paga - pagamentos.
    expect(r.valorBruto - r.creditoTaxa).toBe(r.totalAPagarAgora);
  });

  it("taxa cobrada agora vira crédito: o total continua sendo o bruto, com a taxa dentro dele", () => {
    const r = calcularResumoLocacao(entrada({ reservationFeeStatus: "cobrar_agora" }));
    expect(r.valorBruto).toBe(2500);
    expect(r.taxaACobrarAgora).toBe(250);
    expect(r.valorLocacao).toBe(2250);
    expect(r.totalAPagarAgora).toBe(2500);
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
    expect(r.valorBruto).toBe(2500 + 100 + 100 - 50);
    expect(r.valorLocacao).toBe(r.valorBruto - 250);
  });
});

describe("taxa cobrada agora junto com a locação", () => {
  it("um pagamento só: tira a taxa e sobra o valor da locação", () => {
    const r = descontarTaxaDosPagamentos([{ valor: 2500, forma: "pix" }], 250);
    expect(r.linhas).toEqual([{ valor: 2250, forma: "pix" }]);
    expect(r.taxaNaoCoberta).toBe(0);
  });

  it("vários pagamentos: a taxa sai das primeiras linhas, na ordem", () => {
    const r = descontarTaxaDosPagamentos(
      [
        { valor: 100, forma: "pix" },
        { valor: 150, forma: "dinheiro" },
        { valor: 2250, forma: "credito" },
      ],
      250
    );
    expect(r.linhas).toEqual([{ valor: 2250, forma: "credito" }]);
    expect(r.taxaNaoCoberta).toBe(0);
  });

  it("pagamento menor que a taxa: nada vai para a locação e informa o que faltou", () => {
    const r = descontarTaxaDosPagamentos([{ valor: 200, forma: "pix" }], 250);
    expect(r.linhas).toEqual([]);
    expect(r.taxaNaoCoberta).toBe(50);
  });

  it("o que vai para a locação fecha exatamente com o saldo que o banco enxerga", () => {
    const resumo = calcularResumoLocacao(entrada({ reservationFeeStatus: "cobrar_agora" }));
    const r = descontarTaxaDosPagamentos([{ valor: resumo.totalAPagarAgora }], resumo.taxaACobrarAgora);
    const registrado = r.linhas.reduce((s, l) => s + l.valor, 0);
    // Banco: saldo = valor gravado (bruto) - taxa paga - pagamentos.
    expect(resumo.valorBruto - resumo.taxaACobrarAgora - registrado).toBe(0);
  });
});

describe("contagem inicial e final", () => {
  it("na ordem certa, os disparos são final menos inicial", () => {
    expect(ordenarContagens(7_576_475, 7_656_638)).toEqual({
      inicial: 7_576_475,
      final: 7_656_638,
      disparos: 80_163,
      invertidas: false,
    });
  });

  it("digitadas ao contrário, a menor vira a inicial e o resultado é o mesmo", () => {
    expect(ordenarContagens(7_656_638, 7_576_475)).toEqual({
      inicial: 7_576_475,
      final: 7_656_638,
      disparos: 80_163,
      invertidas: true,
    });
  });

  it("contagens iguais dão zero disparos", () => {
    expect(ordenarContagens(100, 100).disparos).toBe(0);
  });
});

describe("base do desconto em porcentagem", () => {
  const pricing = { totalValue: 6711.41 };

  it("é só o valor dos disparos pela tabela, sem aluguel nem deslocamento", () => {
    expect(
      valorDosDisparos({ isMentoria: false, shots: 80_163, pricing, mentoriaPricing: null, custoManualPorDisparo: null })
    ).toBe(6711.41);
  });

  it("com custo por disparo negociado, a base é disparos x custo e não a tabela", () => {
    expect(
      valorDosDisparos({ isMentoria: false, shots: 80_163, pricing, mentoriaPricing: null, custoManualPorDisparo: 0.05 })
    ).toBe(4008.15);
  });

  it("em mentoria, a base é o valor da mentoria", () => {
    expect(
      valorDosDisparos({ isMentoria: true, shots: 0, pricing: null, mentoriaPricing: { totalValue: 1500 }, custoManualPorDisparo: null })
    ).toBe(1500);
  });
});
