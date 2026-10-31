import { describe, it, expect } from "vitest";
import { ehAjusteDeSaldo, ehForaDoResultado, faltaSqlDoAjuste, lerSaldoInformado, previaAjuste, somarSaldo } from "./ajuste-saldo";
import { ehCategoriaDeEmprestimo } from "./emprestimos";
import { contaNoResultado, evolucaoMensal, porCategoria, tudoQueSaiu, type LinhaFinanceira } from "./relatorio-financeiro";
import { resumoDoMes } from "./pessoal-controle";
import { paraEscolha } from "./categorias";

describe("ajuste de saldo: categoria", () => {
  it("fica fora do resultado sem virar empréstimo", () => {
    expect(ehAjusteDeSaldo("Ajuste de saldo")).toBe(true);
    expect(ehAjusteDeSaldo(" ajuste de saldo ")).toBe(true);
    expect(ehAjusteDeSaldo("Outros")).toBe(false);
    expect(ehAjusteDeSaldo(null)).toBe(false);
    expect(ehForaDoResultado("Ajuste de saldo")).toBe(true);
    expect(ehForaDoResultado("Empréstimo concedido")).toBe(true);
    expect(ehForaDoResultado("Devolução de empréstimo")).toBe(true);
    expect(ehForaDoResultado("Combustível")).toBe(false);
    expect(ehCategoriaDeEmprestimo("Ajuste de saldo")).toBe(false);
  });

  it("não aparece para escolher, menos no lançamento que já é ajuste", () => {
    const lista = [
      { id: "1", name: "Combustível", type: "saida" },
      { id: "2", name: "Ajuste de saldo", type: "saida" },
    ];
    expect(paraEscolha(lista).map((c) => c.id)).toEqual(["1"]);
    expect(paraEscolha(lista, "2").map((c) => c.id)).toContain("2");
  });
});

describe("ajuste de saldo: somas", () => {
  const linhas: LinhaFinanceira[] = [
    { type: "entrada", amount: 1000, date: "2026-10-05", categoria: "Locação" },
    { type: "saida", amount: 200, date: "2026-10-06", categoria: "Combustível" },
    { type: "saida", amount: 2848.18, date: "2026-10-31", categoria: "Ajuste de saldo" },
    { type: "entrada", amount: 50, date: "2026-10-31", categoria: "Ajuste de saldo" },
  ];

  it("resultado, categorias e evolução ignoram o ajuste", () => {
    expect(linhas.filter(contaNoResultado)).toHaveLength(2);
    expect(porCategoria(linhas, "saida").map((c) => c.categoria)).toEqual(["Combustível"]);
    expect(porCategoria(linhas, "entrada").map((c) => c.categoria)).toEqual(["Locação"]);
    const out = evolucaoMensal(linhas, "2026-10-31", 1)[0];
    expect(out).toEqual({ mes: "2026-10", entradas: 1000, saidas: 200, resultado: 800 });
    const r = resumoDoMes(linhas, "2026-10-31");
    expect(r.entradas).toBe(1000);
    expect(r.saidas).toBe(200);
  });

  it("tudo que saiu não conta o ajuste como empréstimo", () => {
    const t = tudoQueSaiu(porCategoria(linhas, "saida"), [], "2026-10-01", "2026-10-31");
    expect(t.despesas).toBe(200);
    expect(t.emprestimos).toBe(0);
    expect(t.total).toBe(200);
  });

  it("o saldo conta o ajuste e deixa de fora compra no cartão e permuta", () => {
    expect(
      somarSaldo([
        { type: "entrada", amount: 7084.01 },
        { type: "saida", amount: 2848.18 },
        { type: "saida", amount: 500, cartao_mov: "compra" },
        { type: "entrada", amount: 300, payment_method: "permuta" },
      ])
    ).toBe(4235.83);
  });
});

describe("ajuste de saldo: tela", () => {
  it("lê o saldo digitado", () => {
    expect(lerSaldoInformado("4235,83")).toBe(4235.83);
    expect(lerSaldoInformado("4.235,83")).toBe(4235.83);
    expect(lerSaldoInformado("R$ 4.235,83")).toBe(4235.83);
    expect(lerSaldoInformado("4235.83")).toBe(4235.83);
    expect(lerSaldoInformado("4.235")).toBe(4235);
    expect(lerSaldoInformado("-150,50")).toBe(-150.5);
    expect(lerSaldoInformado("0")).toBe(0);
    expect(lerSaldoInformado("abc")).toBeNull();
    expect(lerSaldoInformado("")).toBeNull();
  });

  it("prévia: saída quando o app tem a mais, entrada quando tem a menos", () => {
    expect(previaAjuste(7084.01, 4235.83)).toEqual({ diferenca: -2848.18, tipo: "saida", valor: 2848.18 });
    expect(previaAjuste(100, 150.5)).toEqual({ diferenca: 50.5, tipo: "entrada", valor: 50.5 });
    expect(previaAjuste(100, 100)).toEqual({ diferenca: 0, tipo: null, valor: 0 });
  });

  it("reconhece o erro de SQL que falta", () => {
    expect(faltaSqlDoAjuste("Could not find the function public.ajustar_saldo(p_observacao, p_saldo_real, p_scope) in the schema cache")).toBe(true);
    expect(faltaSqlDoAjuste("Sem permissão")).toBe(false);
  });
});
