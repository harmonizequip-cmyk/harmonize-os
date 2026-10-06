import { describe, it, expect } from "vitest";
import { ehCategoriaDeEmprestimo, resumirEmprestimos } from "./emprestimos";

describe("empréstimos", () => {
  it("saldo por devedor = concedido - devolvido, maior saldo primeiro", () => {
    const r = resumirEmprestimos([
      { id: "1", devedor: "LASER DREAM CAMPINA GRANDE", tipo: "concedido", valor: 13082.33, data: "2026-09-22", descricao: null },
      { id: "2", devedor: "LASER DREAM MIRAMAR", tipo: "concedido", valor: 5000, data: "2026-10-01", descricao: null },
      { id: "3", devedor: "LASER DREAM CAMPINA GRANDE", tipo: "devolucao", valor: 3082.33, data: "2026-10-05", descricao: null },
    ]);
    expect(r.map((d) => [d.devedor, d.saldo])).toEqual([
      ["LASER DREAM CAMPINA GRANDE", 10000],
      ["LASER DREAM MIRAMAR", 5000],
    ]);
    expect(r[0].movimentos[0].id).toBe("3");
  });

  it("só as duas categorias de empréstimo ficam fora do resultado", () => {
    expect(ehCategoriaDeEmprestimo("Empréstimo concedido")).toBe(true);
    expect(ehCategoriaDeEmprestimo("Devolução de empréstimo")).toBe(true);
    expect(ehCategoriaDeEmprestimo("Retiradas")).toBe(false);
    expect(ehCategoriaDeEmprestimo(null)).toBe(false);
  });
});
