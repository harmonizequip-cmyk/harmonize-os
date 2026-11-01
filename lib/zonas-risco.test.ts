import { describe, expect, it } from "vitest";
import { AREAS_FIXAS } from "./planejador";
import { CATALOGO_CORPORAL } from "./boneco-corporal";
import { AVISO_GERAL_APLICACAO, ZONA_POR_AREA, ZONA_POR_PARTE, resumoDaZona, zonaDeRisco } from "./zonas-risco";

describe("zonas de risco", () => {
  it("toda área fixa do rosto tem aviso", () => {
    for (const a of AREAS_FIXAS) expect(zonaDeRisco(a), a.id).toBeTruthy();
    for (const id of Object.keys(ZONA_POR_AREA)) expect(AREAS_FIXAS.some((a) => a.id === id), id).toBe(true);
  });
  it("toda região corporal do catálogo tem aviso", () => {
    for (const r of CATALOGO_CORPORAL) {
      expect(ZONA_POR_PARTE[r.id], r.id).toBeTruthy();
      expect(zonaDeRisco({ id: `c_${r.id}`, nome: r.nome, regiao: "corporal", parte: r.id, manual: true })).toBe(ZONA_POR_PARTE[r.id]);
    }
  });
  it("textos certos nas áreas principais", () => {
    expect(zonaDeRisco(AREAS_FIXAS.find((a) => a.id === "jowls")!)).toMatch(/Nervo marginal/);
    expect(zonaDeRisco(AREAS_FIXAS.find((a) => a.id === "papada")!)).toMatch(/osso hioide/);
    expect(zonaDeRisco(AREAS_FIXAS.find((a) => a.id === "olhos")!)).toMatch(/globo ocular/);
    expect(zonaDeRisco({ id: "c1", nome: "Abdômen", regiao: "corporal", parte: "abdomen", manual: true })).toBe("Manter 2 cm do umbigo.");
  });
  it("área manual pelo nome; sem correspondência no rosto, nada", () => {
    expect(zonaDeRisco({ id: "m1", nome: "Região temporal", regiao: "facial", manual: true })).toMatch(/Ramo temporal/);
    expect(zonaDeRisco({ id: "m2", nome: "Colo", regiao: "corporal", manual: true })).toMatch(/mamas/);
    expect(zonaDeRisco({ id: "m3", nome: "Sulco infraglúteo", regiao: "corporal", manual: true })).toMatch(/3 a 4 dedos/);
    expect(zonaDeRisco({ id: "m4", nome: "Nariz", regiao: "facial", manual: true })).toBeNull();
    expect(zonaDeRisco({ id: "m5", nome: "Outra região", regiao: "corporal", manual: true })).toMatch(/saliências ósseas/);
  });
  it("sem travessão nos textos", () => {
    for (const t of [AVISO_GERAL_APLICACAO, ...Object.values(ZONA_POR_AREA), ...Object.values(ZONA_POR_PARTE)]) expect(t).not.toMatch(/[—–]/);
  });
  it("resumo de uma linha", () => {
    expect(resumoDaZona("Manter 2 cm do umbigo.")).toEqual({ curto: "Manter 2 cm do umbigo.", cortado: false });
    const r = resumoDaZona(ZONA_POR_AREA.olhos);
    expect(r.cortado).toBe(true);
    expect(r.curto.length).toBeLessThanOrEqual(73);
    expect(r.curto.endsWith("...")).toBe(true);
  });
});
