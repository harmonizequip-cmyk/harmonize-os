import { describe, it, expect } from "vitest";
import { porCategoria, evolucaoMensal, tudoQueSaiu, type LinhaFinanceira, type EmprestimoPeriodo } from "./relatorio-financeiro";

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

describe("tudo que saiu da conta", () => {
  const e = (o: Partial<EmprestimoPeriodo>): EmprestimoPeriodo => ({
    id: Math.random().toString(),
    devedor: "LASER DREAM JOÃO PESSOA",
    tipo: "concedido",
    valor: 100,
    data: "2026-10-10",
    descricao: null,
    origem: "manual",
    semCaixa: false,
    ...o,
  });
  const gastos = porCategoria(
    [
      l({ amount: 300, categoria: "Hospedagem" }),
      l({ amount: 50, cartao_mov: "compra" }),
      // Compra do cartão marcada como empréstimo e pagamento de fatura não são despesa.
      l({ amount: 999, categoria: "Empréstimo concedido", cartao_mov: "compra" }),
      l({ amount: 500, categoria: "Pagamento de fatura", cartao_mov: "pagamento" }),
    ],
    "saida"
  );

  it("soma despesas e empréstimos do período, separando caixa e cartão por devedor", () => {
    const r = tudoQueSaiu(
      gastos,
      [
        e({ valor: 1000 }),
        e({ valor: 200, origem: "cartao", cartaoId: "c1", faturaRef: "2026-10", data: "2026-10-02" }),
        e({ valor: 400, devedor: "LASER DREAM CAMPINA GRANDE", origem: "cartao", data: "2026-10-31" }),
        e({ valor: 70, tipo: "devolucao", data: "2026-10-15" }),
        e({ valor: 5000, semCaixa: true }),
        e({ valor: 800, data: "2026-11-02", origem: "cartao" }),
        e({ valor: 900, data: "2026-09-30" }),
      ],
      "2026-10-01",
      "2026-10-31"
    );
    expect(r.despesas).toBe(350);
    expect(r.emprestimos).toBe(1600);
    expect(r.emprestimosCaixa).toBe(1000);
    expect(r.emprestimosCartao).toBe(600);
    expect(r.total).toBe(1950);
    expect(r.devolvido).toBe(70);
    expect(r.soPendencia).toBe(5000);
    expect(r.porDevedor).toEqual([
      { devedor: "LASER DREAM JOÃO PESSOA", caixa: 1000, cartao: 200, total: 1200 },
      { devedor: "LASER DREAM CAMPINA GRANDE", caixa: 0, cartao: 400, total: 400 },
    ]);
    expect(r.lancamentos.map((x) => x.valor)).toEqual([400, 1000, 200]);
  });

  it("sem empréstimo, o total é só a despesa", () => {
    const r = tudoQueSaiu(gastos, [], "2026-10-01", "2026-10-31");
    expect(r).toMatchObject({ despesas: 350, emprestimos: 0, total: 350, porDevedor: [], lancamentos: [] });
  });
});
