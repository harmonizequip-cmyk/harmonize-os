import { describe, expect, it } from "vitest";
import { AREAS_FIXAS, alertas, normalizarPlano, paraEstado, situacaoSaldo, textoResumo, todasAreas, totalArea, totalDistribuido } from "./planejador";
import { htmlFichaPaciente, htmlProntuario } from "./planejador-impressao";
import { svgModeloFacial, VISTA_DA_AREA } from "./modelo-facial";

// Estado salvo pelo planejador antigo (HTML): áreas manuais levavam a imagem dentro.
const antigo = {
  paciente: "Rebeca",
  data: "2026-10-16",
  saldoTotal: "12000",
  perfil: "12000",
  procNome: "Full Face",
  recomendacoes: "",
  customSeq: 2,
  customAreas: [
    { id: "custom_1", nome: "Mento", bilateral: false, opts: ["1.5"], regiao: "facial", img: "data:image/jpeg;base64,AAAA" },
    { id: "custom_2", nome: "Coxa posterior", bilateral: true, opts: ["1.5"], regiao: "corporal", img: "/ferramentas/corpo/coxa_posterior.svg" },
  ],
  DATA: {
    frontal: [{ prof: "4.5", dispD: 500, dispE: 500 }, { prof: "1.5", dispD: 600, dispE: 0, feito: true }],
    papada: [{ prof: "10.0", disp: 2500 }],
    arcomandibular: [{ prof: "3.0", dispD: 1000, dispE: 1000 }],
    custom_2: [{ prof: "4.5", dispD: 3200, dispE: 3200, quad: 2 }],
  },
};

describe("planejador nativo: estado antigo", () => {
  const p = normalizarPlano(antigo, "2026-10-20");
  it("abre igual: áreas fixas todas presentes, manuais com a parte do corpo e sem imagem", () => {
    expect(Object.keys(p.DATA)).toEqual(expect.arrayContaining(AREAS_FIXAS.map((a) => a.id)));
    expect(p.customAreas[1]).toMatchObject({ id: "custom_2", regiao: "corporal", parte: "coxa_posterior", bilateral: true });
    expect(JSON.stringify(paraEstado(p))).not.toContain("base64");
    expect(p.recomendacoes).toBe("Beber bastante água e passar protetor solar");
    expect(p.data).toBe("2026-10-16");
  });
  it("Terço médio é o antigo arco mandibular e não há nasolabial", () => {
    expect(AREAS_FIXAS.find((a) => a.id === "arcomandibular")?.nome).toBe("Terço médio");
    expect(AREAS_FIXAS.some((a) => /nasolabial/i.test(a.nome))).toBe(false);
  });
  it("contas: corporal multiplica por quadrante", () => {
    const corp = todasAreas(p).find((a) => a.id === "custom_2")!;
    expect(totalArea(p, corp)).toBe(12800);
    expect(totalDistribuido(p)).toBe(1000 + 600 + 2500 + 2000 + 12800);
    expect(situacaoSaldo(p).estado).toBe("estourado");
  });
  it("alertas: saldo estourado e linha acima do máximo", () => {
    const a = alertas(p);
    expect(a[0].grave).toBe(true);
    expect(a.some((x) => x.areaId === "frontal")).toBe(true); // 600 > 500
    expect(a.some((x) => x.areaId === "papada")).toBe(true); // 2500 > 2400
  });
  it("ida e volta mantém tudo", () => {
    expect(normalizarPlano(paraEstado(p))).toEqual(p);
  });
  it("texto, prontuário e ficha saem com as áreas", () => {
    const t = textoResumo(p, new Date(2026, 9, 16, 10, 0));
    expect(t).toContain("▸ TERÇO MÉDIO (D/E)");
    expect(t).toContain("[x] 1.5mm → D:600 | E:0");
    expect(t).toContain("× 2 quad. = 12.800");
    expect(htmlProntuario(p)).toContain("Coxa posterior");
    expect(htmlFichaPaciente(p)).toContain("Assinatura do Paciente");
    expect(htmlProntuario({ ...p, paciente: "<b>x</b>" })).not.toContain("<b>x</b>");
  });
  it("plano vazio abre com a data de hoje", () => {
    const v = normalizarPlano({}, "2026-10-20");
    expect(v.data).toBe("2026-10-20");
    expect(totalDistribuido(v)).toBe(0);
  });
});

describe("modelo facial", () => {
  it("toda área fixa tem desenho com seta", () => {
    for (const a of AREAS_FIXAS) {
      expect(VISTA_DA_AREA[a.id]).toBeTruthy();
      expect(svgModeloFacial(a.id)).toMatch(/marker-end|stroke="#D9577E"/);
    }
    expect(svgModeloFacial("facial")).not.toContain("marker-end=");
  });
});
