import { describe, expect, it } from "vitest";
import { reaisTabela } from "./tabela-precos-arte";

describe("reaisTabela", () => {
  it("formata com 2 casas, ou 3 quando precisa", () => {
    expect(reaisTabela(2500)).toBe("R$ 2.500,00");
    expect(reaisTabela(0.1)).toBe("R$ 0,10");
    expect(reaisTabela(0.07)).toBe("R$ 0,07");
    expect(reaisTabela(0.065)).toBe("R$ 0,065");
  });
});
