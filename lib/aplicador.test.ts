import { describe, it, expect } from "vitest";
import { situacaoAplicador, lerContador, formatarContador } from "./aplicador";

describe("situacaoAplicador", () => {
  it("sem garantia não alerta", () => {
    expect(situacaoAplicador({ disparos: 900_000, garantia_disparos: null }).situacao).toBe("sem_garantia");
  });
  it("ok, perto e fora da garantia", () => {
    expect(situacaoAplicador({ disparos: 100_000, garantia_disparos: 500_000 })).toEqual({ situacao: "ok", pct: 0.2, faltam: 400_000 });
    expect(situacaoAplicador({ disparos: 450_000, garantia_disparos: 500_000 }).situacao).toBe("perto");
    expect(situacaoAplicador({ disparos: 510_000, garantia_disparos: 500_000 })).toMatchObject({ situacao: "fora", faltam: 0 });
  });
});

describe("contador", () => {
  it("lê com ou sem ponto", () => {
    expect(lerContador("448.395")).toBe(448395);
    expect(lerContador("")).toBeNull();
    expect(formatarContador("448395")).toBe("448.395");
  });
});
