import { describe, it, expect } from "vitest";
import { textoDataArte, telefoneArte } from "./arte-divulgacao";

describe("arte de divulgação", () => {
  it("data de um dia e de vários", () => {
    expect(textoDataArte("2026-10-20")).toEqual({ linha1: "terça-feira", linha2: "20 de outubro" });
    expect(textoDataArte("2026-10-20", "2026-10-22").linha2).toBe("20 a 22 de outubro");
    expect(textoDataArte("2026-10-30", "2026-11-01").linha2).toBe("30/10 a 1º/11");
    expect(textoDataArte("2026-11-01").linha2).toBe("1º de novembro");
  });
  it("telefone", () => {
    expect(telefoneArte("5583999998888")).toBe("(83) 99999-8888");
    expect(telefoneArte("83 3222-1111")).toBe("(83) 3222-1111");
    expect(telefoneArte(null)).toBe("");
  });
});
