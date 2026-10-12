import { describe, it, expect } from "vitest";
import { situacaoAplicador, lerContador, formatarContador } from "./aplicador";

describe("situacaoAplicador", () => {
  it("sem limite não alerta", () => {
    expect(situacaoAplicador({ disparos: 900_000, limite_disparos: null }).situacao).toBe("sem_limite");
  });
  it("ok, perto e passou", () => {
    expect(situacaoAplicador({ disparos: 100_000, limite_disparos: 500_000 })).toEqual({ situacao: "ok", pct: 0.2, faltam: 400_000 });
    expect(situacaoAplicador({ disparos: 450_000, limite_disparos: 500_000 }).situacao).toBe("perto");
    expect(situacaoAplicador({ disparos: 510_000, limite_disparos: 500_000 })).toMatchObject({ situacao: "passou", faltam: 0 });
  });
});

describe("contador", () => {
  it("lê com ou sem ponto", () => {
    expect(lerContador("448.395")).toBe(448395);
    expect(lerContador("")).toBeNull();
    expect(formatarContador("448395")).toBe("448.395");
  });
});
