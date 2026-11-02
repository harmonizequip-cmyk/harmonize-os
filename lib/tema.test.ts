import { describe, expect, it } from "vitest";
import { COR_BARRA, TEMAS, ehTema, nomeDoTema } from "./tema";

describe("temas", () => {
  it("tem os três temas, Clássico primeiro", () => {
    expect(TEMAS.map((t) => t.id)).toEqual(["classico", "aurora", "hipro"]);
  });
  it("reconhece só valores válidos da chave harmonize-tema", () => {
    expect(ehTema("hipro")).toBe(true);
    expect(ehTema("aurora")).toBe(true);
    expect(ehTema("classico")).toBe(true);
    expect(ehTema("suave")).toBe(false);
    expect(ehTema(null)).toBe(false);
  });
  it("dá o nome e a cor da barra de cada tema", () => {
    expect(nomeDoTema("hipro")).toBe("HIPRO");
    expect(COR_BARRA.hipro).toBe("#002431");
    expect(COR_BARRA.classico).toBe("#2e9a94");
  });
});
