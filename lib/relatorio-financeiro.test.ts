import { describe, it, expect } from "vitest";
import { porCategoria, evolucaoMensal, type LinhaFinanceira } from "./relatorio-financeiro";

const l = (o: Partial<LinhaFinanceira>): LinhaFinanceira => ({ type: "saida", amount: 100, date: "2026-10-05", categoria: "Combustível", ...o });

describe("relatório financeiro", () => {
  const linhas = [
    l({}),
    l({ amount: 300, categoria: "Hospedagem" }),
    l({ amount: 999, categoria: "Empréstimo concedido" }),
    l({ amount: 500, categoria: "Pagamento de fatura", cartao_mov: "pagamento" }),
    l({ amount: 50, categoria: "Combustível", cartao_mov: "compra" }),
    l({ type: "entrada", amount: 2000, categoria: "Locação", date: "2026-09-10" }),
  ];
  it("gastos por categoria sem empréstimo nem fatura paga", () => {
    expect(porCategoria(linhas, "saida")).toEqual([
      { categoria: "Hospedagem", total: 300, pct: 300 / 450 },
      { categoria: "Combustível", total: 150, pct: 150 / 450 },
    ]);
  });
  it("evolução mês a mês com meses zerados", () => {
    const ev = evolucaoMensal(linhas, "2026-10-12", 3);
    expect(ev.map((m) => m.mes)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(ev[1]).toMatchObject({ entradas: 2000, saidas: 0, resultado: 2000 });
    expect(ev[2]).toMatchObject({ entradas: 0, saidas: 450, resultado: -450 });
    expect(evolucaoMensal([], "2026-01-01", 2).map((m) => m.mes)).toEqual(["2025-12", "2026-01"]);
  });
});
