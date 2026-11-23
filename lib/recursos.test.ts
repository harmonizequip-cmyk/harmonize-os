import { describe, expect, it } from "vitest";
import { alternarLiberado, estaLiberado, lerLiberados, RECURSOS } from "./recursos";

describe("recursos em teste", () => {
  it("lê só ids válidos, sem repetir", () => {
    expect(lerLiberados(null)).toEqual([]);
    expect(lerLiberados("tour")).toEqual([]);
    expect(lerLiberados(["tour-planejador", "tour-planejador", 3, "X Y", ""])).toEqual(["tour-planejador"]);
  });
  it("nada liberado por padrão", () => {
    expect(estaLiberado([], "tour-planejador")).toBe(false);
    expect(estaLiberado(null, "tour-planejador")).toBe(false);
    expect(estaLiberado(["tour-planejador"], "tour-planejador")).toBe(true);
  });
  it("liberar e voltar para teste mexem só no recurso escolhido", () => {
    expect(alternarLiberado(["a"], "tour-planejador", true)).toEqual(["a", "tour-planejador"]);
    expect(alternarLiberado(["a", "tour-planejador"], "tour-planejador", false)).toEqual(["a"]);
    expect(alternarLiberado(["tour-planejador"], "tour-planejador", true)).toEqual(["tour-planejador"]);
  });
  it("todo recurso tem id válido e único", () => {
    const ids = RECURSOS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(lerLiberados([id])).toEqual([id]);
  });
});
