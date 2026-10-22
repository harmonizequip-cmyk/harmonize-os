import { describe, expect, it } from "vitest";
import { normalizarPlano, totalArea, totalDistribuido, AREAS_FIXAS } from "./planejador";
import { aplicarQuantidades, areasParaCusto, custoDisparos, escalarArea, lerTaxa } from "./custo-disparos";

const plano = normalizarPlano({
  DATA: {
    frontal: [{ prof: "4.5", dispD: 500, dispE: 500 }, { prof: "1.5", dispD: 250, dispE: 250 }],
    papada: [{ prof: "10.0", disp: 1000 }, { prof: "4.5", disp: 500 }],
    jowls: [{ prof: "4.5", dispD: 1500, dispE: 1500 }],
  },
});

describe("custo dos disparos", () => {
  it("multiplica pelos valores 0,12, 0,10 e 0,07", () => {
    expect(custoDisparos(10000, 0.12)).toBe(1200);
    expect(custoDisparos(10000, 0.1)).toBe(1000);
    expect(custoDisparos(10000, 0.07)).toBe(700);
    expect(custoDisparos(0, 0.1)).toBe(0);
    expect(custoDisparos(1234, 0.075)).toBe(92.55);
  });
  it("lê valor digitado com vírgula ou ponto", () => {
    expect(lerTaxa("0,12")).toBe(0.12);
    expect(lerTaxa(" 0.075 ")).toBe(0.075);
    expect(lerTaxa("")).toBe(0);
    expect(lerTaxa("abc")).toBe(0);
  });
  it("lista só áreas com disparos, com o total de cada uma", () => {
    expect(areasParaCusto(plano).map((a) => [a.id, a.disparos])).toEqual([
      ["papada", 1500],
      ["jowls", 3000],
      ["frontal", 1500],
    ]);
  });
  it("escalar uma área mantém a proporção e fecha no total pedido", () => {
    const frontal = AREAS_FIXAS.find((a) => a.id === "frontal")!;
    const linhas = escalarArea(plano, frontal, 3000);
    expect(linhas).toEqual([
      { prof: "4.5", dispD: 1000, dispE: 1000 },
      { prof: "1.5", dispD: 500, dispE: 500 },
    ]);
    const menor = escalarArea(plano, frontal, 1000);
    expect(menor.reduce((t, l) => t + (l.dispD ?? 0) + (l.dispE ?? 0), 0)).toBe(1000);
  });
  it("área sem disparos recebe o total na primeira linha, dividido entre os lados", () => {
    const sub = AREAS_FIXAS.find((a) => a.id === "submandibular")!;
    const linhas = escalarArea(plano, sub, 2400);
    expect(linhas[0]).toMatchObject({ dispD: 1200, dispE: 1200 });
  });
  it("aplicar troca só as áreas que mudaram", () => {
    const novo = aplicarQuantidades(plano, { papada: 3000, jowls: 3000, frontal: 1500 });
    expect(totalArea(novo, AREAS_FIXAS.find((a) => a.id === "papada")!)).toBe(3000);
    expect(novo.DATA.jowls).toEqual(plano.DATA.jowls);
    expect(totalDistribuido(novo)).toBe(3000 + 3000 + 1500);
    expect(plano.DATA.papada[0].disp).toBe(1000);
  });
});
