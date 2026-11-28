import { describe, expect, it } from "vitest";
import { distribuirNasPendencias, ordenarPendencias, separarPagamentos, totalPendencias } from "./pendencias-anteriores";

const pend = [
  { rentalId: "b", data: "2026-11-10", saldo: 300 },
  { rentalId: "a", data: "2026-10-05", saldo: 200.5 },
  { rentalId: "z", data: "2026-09-01", saldo: 0 },
];

describe("pendências anteriores", () => {
  it("soma e ordena da mais antiga, sem as quitadas", () => {
    expect(totalPendencias(pend)).toBe(500.5);
    expect(ordenarPendencias(pend).map((p) => p.rentalId)).toEqual(["a", "b"]);
  });

  it("os pagamentos cobrem primeiro a locação de agora", () => {
    const linhas = [
      { forma: "pix", valor: 1000 },
      { forma: "dinheiro", valor: 400 },
    ];
    const { atual, sobra } = separarPagamentos(linhas, 1200);
    expect(atual).toEqual([
      { forma: "pix", valor: 1000 },
      { forma: "dinheiro", valor: 200 },
    ]);
    expect(sobra).toEqual([{ forma: "dinheiro", valor: 200 }]);
  });

  it("a sobra quita as anteriores da mais antiga para a mais nova, dividindo a linha", () => {
    const { pagamentos, naoUsado } = distribuirNasPendencias([{ forma: "pix", valor: 400 }], pend);
    expect(pagamentos).toEqual([
      { rentalId: "a", linha: { forma: "pix", valor: 200.5 } },
      { rentalId: "b", linha: { forma: "pix", valor: 199.5 } },
    ]);
    expect(naoUsado).toBe(0);
  });

  it("o que passa do pendente não vai para lugar nenhum", () => {
    const { pagamentos, naoUsado } = distribuirNasPendencias([{ forma: "pix", valor: 600 }], pend);
    expect(pagamentos.reduce((s, p) => s + p.linha.valor, 0)).toBe(500.5);
    expect(naoUsado).toBe(99.5);
  });

  it("pagamento menor que a locação de agora não sobra nada", () => {
    expect(separarPagamentos([{ valor: 500 }], 1200)).toEqual({ atual: [{ valor: 500 }], sobra: [] });
  });
});
