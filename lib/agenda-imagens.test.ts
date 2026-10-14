import { describe, expect, it } from "vitest";
import { diasLivresDoMes, mesesDoPeriodo } from "./agenda-imagens";

describe("agenda para mandar", () => {
  it("pega os meses que o período toca", () => {
    expect(mesesDoPeriodo("2026-10-20", "2026-11-04").map((m) => m.getMonth())).toEqual([9, 10]);
    expect(mesesDoPeriodo("2026-11-01", "2026-11-15").map((m) => m.getMonth())).toEqual([10]);
  });
  it("dia livre: sem ocupação, sem domingo, sem passado", () => {
    const livres = diasLivresDoMes(new Date(2026, 10, 1, 12), new Set(["2026-11-03"]), new Date(2026, 10, 2));
    expect(livres.has("2026-11-01")).toBe(false); // domingo e passado
    expect(livres.has("2026-11-02")).toBe(true);
    expect(livres.has("2026-11-03")).toBe(false); // ocupado
    expect(livres.has("2026-11-08")).toBe(false); // domingo
    expect(livres.has("2026-11-30")).toBe(true);
  });
});
