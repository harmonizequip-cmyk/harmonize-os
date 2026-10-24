import { describe, it, expect } from "vitest";
import { ehCategoriaDeEmprestimo, resumirEmprestimos } from "./emprestimos";

describe("empréstimos", () => {
  it("saldo por devedor = concedido - devolvido, maior saldo primeiro", () => {
    const r = resumirEmprestimos([
      { id: "1", devedor: "LASER DREAM CAMPINA GRANDE", tipo: "concedido", valor: 13082.33, data: "2026-09-22", descricao: null },
      { id: "2", devedor: "LASER DREAM JOÃO PESSOA", tipo: "concedido", valor: 5000, data: "2026-10-01", descricao: null },
      { id: "3", devedor: "LASER DREAM CAMPINA GRANDE", tipo: "devolucao", valor: 3082.33, data: "2026-10-05", descricao: null },
    ]);
    expect(r.map((d) => [d.devedor, d.saldo])).toEqual([
      ["LASER DREAM CAMPINA GRANDE", 10000],
      ["LASER DREAM JOÃO PESSOA", 5000],
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

describe("devedores configuráveis", () => {
  it("padrão igual ao de antes", async () => {
    const m = await import("./emprestimos");
    expect(m.DEVEDORES_SUGERIDOS).toEqual(["LASER DREAM CAMPINA GRANDE", "LASER DREAM JOÃO PESSOA"]);
    expect(m.rotuloDevedor("LASER DREAM CAMPINA GRANDE")).toBe("Campina Grande");
    expect(m.rotuloDevedor("LASER DREAM JOÃO PESSOA")).toBe("João Pessoa");
    expect(m.tituloEmprestimo()).toBe("Empréstimo para a Laser Dream");
  });
  it("lista diferente", async () => {
    const m = await import("./emprestimos");
    const l = ["CLINICA SOL", "STUDIO LUA"];
    expect(m.rotuloDevedor("CLINICA SOL", l)).toBe("Clinica Sol");
    expect(m.tituloEmprestimo(l)).toBe("Empréstimo");
    expect(m.tituloEmprestimo(["ANA PAULA", "ANA MARIA"])).toBe("Empréstimo para Ana");
    expect(m.tituloEmprestimo([])).toBe("Empréstimo");
  });
});
