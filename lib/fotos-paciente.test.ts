import { describe, expect, it } from "vitest";
import {
  AREA_ROSTO,
  ETAPAS_FOTO,
  agruparFotos,
  areasCorporaisDosPlanos,
  areasParaFoto,
  caminhosDaFoto,
  faltaSqlDasFotos,
  formatarTamanho,
  medidasReduzidas,
  rotuloDaEtapa,
  type EtapaFoto,
} from "./fotos-paciente";

describe("ETAPAS_FOTO", () => {
  it("tem as 5 etapas na ordem", () => {
    expect(ETAPAS_FOTO.map((e) => e.id)).toEqual(["antes", "imediato", "d30", "d60", "d90"]);
    expect(ETAPAS_FOTO.map((e) => e.rotulo)).toEqual(["Antes", "Imediato", "30 dias", "60 dias", "90 dias"]);
  });
  it("rotuloDaEtapa", () => {
    expect(rotuloDaEtapa("d60")).toBe("60 dias");
    expect(rotuloDaEtapa("xyz")).toBe("xyz");
  });
});

describe("caminhosDaFoto", () => {
  it("monta foto e miniatura", () => {
    expect(caminhosDaFoto("pac-1", "d30", "abc")).toEqual({ caminho: "p/pac-1/d30/abc.jpg", miniatura: "p/pac-1/d30/abc_mini.jpg" });
  });
});

describe("medidasReduzidas", () => {
  it("limita o lado maior (paisagem e retrato)", () => {
    expect(medidasReduzidas(4000, 3000, 1600)).toEqual({ largura: 1600, altura: 1200 });
    expect(medidasReduzidas(3000, 4000, 1600)).toEqual({ largura: 1200, altura: 1600 });
  });
  it("não aumenta foto pequena", () => {
    expect(medidasReduzidas(800, 600, 1600)).toEqual({ largura: 800, altura: 600 });
  });
  it("arredonda e nunca fica abaixo de 1", () => {
    expect(medidasReduzidas(4032, 3023, 400)).toEqual({ largura: 400, altura: 300 });
    expect(medidasReduzidas(10000, 1, 400)).toEqual({ largura: 400, altura: 1 });
    expect(medidasReduzidas(0, 0, 400)).toEqual({ largura: 1, altura: 1 });
  });
});

describe("agruparFotos", () => {
  const f = (id: string, etapa: EtapaFoto, area: string | null, tirada_em: string, created_at = "2026-10-01T10:00:00Z") => ({
    id,
    etapa,
    area,
    tirada_em,
    created_at,
  });
  it("agrupa por etapa na ordem e por área, com Rosto para nula", () => {
    const g = agruparFotos([
      f("1", "d30", "Papada", "2026-11-01"),
      f("2", "antes", null, "2026-10-01"),
      f("3", "antes", "Papada", "2026-10-01"),
      f("4", "antes", "papada", "2026-09-30"),
      f("5", "antes", "Frontal", "2026-10-01"),
    ]);
    expect(g.map((e) => e.etapa)).toEqual(["antes", "imediato", "d30", "d60", "d90"]);
    expect(g.map((e) => e.total)).toEqual([4, 0, 1, 0, 0]);
    expect(g[0].areas.map((a) => a.area)).toEqual([AREA_ROSTO, "Frontal", "Papada"]);
    expect(g[0].areas[2].fotos.map((x) => x.id)).toEqual(["4", "3"]);
    expect(g[1].areas).toEqual([]);
  });
  it("ordena por data e depois por envio", () => {
    const g = agruparFotos([
      f("b", "imediato", null, "2026-10-02", "2026-10-02T12:00:00Z"),
      f("a", "imediato", null, "2026-10-02", "2026-10-02T09:00:00Z"),
      f("c", "imediato", "", "2026-10-01", "2026-10-03T09:00:00Z"),
    ]);
    expect(g[1].areas).toHaveLength(1);
    expect(g[1].areas[0].fotos.map((x) => x.id)).toEqual(["c", "a", "b"]);
  });
});

describe("areasParaFoto", () => {
  it("Rosto primeiro, sem repetir (acento e maiúscula)", () => {
    expect(AREA_ROSTO).toBe("Rosto");
    expect(areasParaFoto(["Abdômen", "abdomen", "Flancos", "FLANCOS", " Culote ", "", "rosto"])).toEqual([AREA_ROSTO, "Abdômen", "Flancos", "Culote"]);
  });
  it("sem áreas corporais, só Rosto", () => {
    expect(areasParaFoto([])).toEqual([AREA_ROSTO]);
  });
});

describe("formatarTamanho", () => {
  it("KB, MB e GB em pt-BR", () => {
    expect(formatarTamanho(850 * 1024)).toBe("850 KB");
    expect(formatarTamanho(12.4 * 1024 * 1024)).toBe("12,4 MB");
    expect(formatarTamanho(1.2 * 1024 * 1024 * 1024)).toBe("1,2 GB");
    expect(formatarTamanho(2 * 1024 * 1024)).toBe("2 MB");
    expect(formatarTamanho(0)).toBe("0 KB");
  });
});

describe("faltaSqlDasFotos", () => {
  it("reconhece tabela ou função inexistente", () => {
    expect(faltaSqlDasFotos({ code: "42P01" })).toBe(true);
    expect(faltaSqlDasFotos({ code: "PGRST205", message: "Could not find the table 'public.paciente_fotos'" })).toBe(true);
    expect(faltaSqlDasFotos({ message: 'relation "paciente_fotos" does not exist' })).toBe(true);
    expect(faltaSqlDasFotos({ code: "42501", message: "permission denied" })).toBe(false);
    expect(faltaSqlDasFotos(null)).toBe(false);
  });
});

describe("areasCorporaisDosPlanos", () => {
  it("só as corporais, da sessão aberta e das anteriores, sem repetir", () => {
    const estados = [
      {
        customAreas: [
          { id: "custom_1", nome: "Abdômen", regiao: "corporal" },
          { id: "custom_2", nome: "Mento", regiao: "facial" },
        ],
        sessoesAnteriores: [{ n: 1, data: "2026-09-01", DATA: {}, customAreas: [{ id: "custom_3", nome: "Flancos", regiao: "corporal" }, { id: "custom_4", nome: "abdomen", regiao: "corporal" }] }],
      },
      { customAreas: [{ id: "custom_1", nome: "Culote", regiao: "corporal" }] },
      null,
    ] as never[];
    expect(areasCorporaisDosPlanos(estados)).toEqual(["Abdômen", "Flancos", "Culote"]);
  });
  it("plano só de rosto não tem área corporal", () => {
    expect(areasCorporaisDosPlanos([{ customAreas: [] } as never])).toEqual([]);
  });
});
