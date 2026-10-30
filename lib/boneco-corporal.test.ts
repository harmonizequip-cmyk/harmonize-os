import { describe, expect, test } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { CATALOGO_CORPORAL, formasDaRegiao, svgBoneco, urlBoneco } from "./boneco-corporal";
import { REGIOES_FOTO, recorteDaRegiao, vistaDaRegiao } from "./corpo-foto";

// As imagens do planejador (public/ferramentas/corpo) saem de svgBoneco.
// Mudou o desenho: rode `ATUALIZAR_BONECO=1 npx vitest run lib/boneco-corporal.test.ts`.
const PASTA = join(__dirname, "..", "public", "ferramentas", "corpo");
const arquivos: [string, string[]][] = [["corpo", []], ...CATALOGO_CORPORAL.map((c) => [c.id, [c.id]] as [string, string[]])];

describe("boneco corporal", () => {
  test("toda região do catálogo tem desenho, e as de dois lados aparecem em par", () => {
    for (const c of CATALOGO_CORPORAL) {
      const formas = formasDaRegiao(c.id);
      expect(formas.length, c.id).toBeGreaterThan(0);
      if (c.bilateral && c.id !== "costas") expect(formas.length % 2, c.id).toBe(0);
    }
  });

  test("corpo inteiro nas duas vistas e a região na cor da marca", () => {
    const s = svgBoneco(["bracos"]);
    expect(s).toContain("Frente");
    expect(s).toContain("Costas");
    expect(s).toContain("#3AABA0");
    expect(svgBoneco([]).length).toBeLessThan(s.length);
    expect(urlBoneco("abdomen")).toBe("/ferramentas/corpo/abdomen.svg");
  });

  test("toda região do catálogo pode ser tocada na foto do corpo", () => {
    for (const c of CATALOGO_CORPORAL) {
      const r = REGIOES_FOTO[c.id];
      expect(r?.frente?.length || r?.costas?.length, c.id).toBeGreaterThan(0);
    }
  });

  test("mãos: bilateral, nas duas fotos e com recorte nelas", () => {
    const maos = CATALOGO_CORPORAL.find((c) => c.id === "maos");
    expect(maos).toMatchObject({ nome: "Mãos", bilateral: true });
    expect(formasDaRegiao("maos")).toHaveLength(4);
    expect(REGIOES_FOTO.maos.frente).toHaveLength(2);
    expect(REGIOES_FOTO.maos.costas).toHaveLength(2);
    expect(vistaDaRegiao("maos")).toBe("frente");
    const r = recorteDaRegiao("maos", "frente");
    for (const [cx, cy] of REGIOES_FOTO.maos.frente!) {
      expect(cy).toBeGreaterThanOrEqual(r.y);
      expect(cy).toBeLessThanOrEqual(r.y + r.lado);
      expect(cx).toBeGreaterThanOrEqual(r.x);
      expect(cx).toBeLessThanOrEqual(r.x + r.lado);
    }
  });

  test("arquivos do planejador em dia com o desenho", () => {
    if (process.env.ATUALIZAR_BONECO) {
      if (!existsSync(PASTA)) mkdirSync(PASTA, { recursive: true });
      for (const [nome, ids] of arquivos) writeFileSync(join(PASTA, `${nome}.svg`), svgBoneco(ids) + "\n");
    }
    for (const [nome, ids] of arquivos) {
      expect(readFileSync(join(PASTA, `${nome}.svg`), "utf8"), nome).toBe(svgBoneco(ids) + "\n");
    }
  });
});
