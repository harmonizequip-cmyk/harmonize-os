import { describe, expect, it } from "vitest";
import { montarFluxo, somarPorCategoria } from "./grafico-fluxo";

const tx = [
  { type: "entrada" as const, amount: 2500, date: "2026-10-01", categories: { name: "Locação" } },
  { type: "saida" as const, amount: 300, date: "2026-10-01", categories: { name: "Combustível" } },
  { type: "saida" as const, amount: "200", date: "2026-10-03", categories: { name: "Alimentação" } },
  { type: "entrada" as const, amount: 250, date: "2026-10-03", categories: { name: "Taxa de reserva" } },
];

describe("montarFluxo", () => {
  it("dia a dia, com dias vazios e acumulado", () => {
    const p = montarFluxo(tx, "2026-10-01", "2026-10-03");
    expect(p.map((x) => x.rotulo)).toEqual(["01/10", "02/10", "03/10"]);
    expect(p.map((x) => x.acumulado)).toEqual([2200, 2200, 2250]);
    expect(p[2]).toMatchObject({ entradas: 250, saidas: 200 });
  });
  it("mês a mês em período longo", () => {
    const p = montarFluxo(tx, "2026-01-01", "2026-10-14");
    expect(p).toHaveLength(10);
    expect(p[9]).toMatchObject({ rotulo: "out/26", entradas: 2750, saidas: 500, acumulado: 2250 });
  });
  it("período invertido não quebra", () => {
    expect(montarFluxo(tx, "2026-10-05", "2026-10-01")).toEqual([]);
  });
});

describe("somarPorCategoria", () => {
  it("maiores primeiro, resto em Outras", () => {
    const f = somarPorCategoria(tx, "saida", 1);
    expect(f.map((x) => x.nome)).toEqual(["Combustível", "Outras"]);
    expect(f[0].pct).toBeCloseTo(0.6);
  });
});
