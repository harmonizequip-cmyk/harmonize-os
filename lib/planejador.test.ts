import { describe, expect, it } from "vitest";
import {
  AREAS_FIXAS,
  alertas,
  contaDaSessao,
  fecharSessao,
  normalizarPlano,
  paraEstado,
  planoDaSessao,
  reabrirSessaoAnterior,
  situacaoSaldo,
  textoResumo,
  todasAreas,
  totalArea,
  totalDistribuido,
} from "./planejador";
import { htmlFichaPaciente, htmlProntuario, imagemDaArea } from "./planejador-impressao";
import { existsSync } from "node:fs";

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
  it("submandibular com direito e esquerdo (formato antigo) entra na papada e nasolabial manual vai para o jowls", () => {
    const q = normalizarPlano({
      customAreas: [{ id: "custom_1", nome: "Nasolabial", bilateral: true, regiao: "facial" }],
      DATA: { submandibular: [{ prof: "4.5", dispD: 600, dispE: 600 }], papada: [{ prof: "10.0", disp: 800 }], custom_1: [{ prof: "3.0", dispD: 400, dispE: 400 }] },
    });
    expect(q.DATA.papada).toEqual([{ prof: "10.0", disp: 800 }, { prof: "4.5", disp: 1200 }]);
    expect(q.DATA.jowls).toEqual([{ prof: "3.0", dispD: 400, dispE: 400 }]);
    expect(q.customAreas).toEqual([]);
    expect(q.DATA.submandibular).toEqual([{ prof: "1.5", disp: 0 }]);
  });
  it("submandibular novo (campo único) fica na própria área e não vai para a papada", () => {
    const q = normalizarPlano({ DATA: { submandibular: [{ prof: "3.0", disp: 900 }], papada: [{ prof: "10.0", disp: 800 }] } });
    expect(q.DATA.submandibular).toEqual([{ prof: "3.0", disp: 900 }]);
    expect(q.DATA.papada).toEqual([{ prof: "10.0", disp: 800 }]);
  });
  it("Papada e Submandibular são áreas distintas, as duas de campo único", () => {
    const pap = AREAS_FIXAS.find((a) => a.id === "papada")!;
    const sub = AREAS_FIXAS.find((a) => a.id === "submandibular")!;
    expect(pap.nome).toBe("Papada");
    expect(sub.nome).toBe("Submandibular");
    expect(pap.bilateral).toBe(false);
    expect(sub.bilateral).toBe(false);
    const q = normalizarPlano({ DATA: { submandibular: [{ prof: "4.5", disp: 1300 }] } });
    expect(alertas(q).some((x) => x.areaId === "submandibular" && /1\.200/.test(x.texto) && !/por lado/.test(x.texto))).toBe(true);
    const ok = normalizarPlano({ DATA: { submandibular: [{ prof: "4.5", disp: 1200 }] } });
    expect(alertas(ok).some((x) => x.areaId === "submandibular")).toBe(false);
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

describe("fotos das áreas", () => {
  it("toda área fixa tem a foto do protocolo antigo", () => {
    for (const a of AREAS_FIXAS) expect(existsSync(`public${imagemDaArea(a)}`)).toBe(true);
    expect(imagemDaArea({ id: "custom_9", nome: "Mento", bilateral: true, opts: [], manual: true })).toMatch(/^data:image\/svg/);
  });
});


// ─── Sessões do pacote ───
const pacote = (extra: Record<string, unknown> = {}) =>
  normalizarPlano(
    {
      paciente: "Marina",
      data: "2026-10-20",
      dataRetorno: "2026-12-19",
      saldoTotal: "16000",
      recomendacoes: "",
      sessoesTotal: 2,
      DATA: { frontal: [{ prof: "4.5", dispD: 500, dispE: 500 }], jowls: [{ prof: "3.0", dispD: 1200, dispE: 1200 }], papada: [{ prof: "10.0", disp: 2400 }], arcomandibular: [{ prof: "3.0", dispD: 1200, dispE: 1200 }], pescoco: [{ prof: "4.5", dispD: 1200, dispE: 1200 }, { prof: "1.5", dispD: 600, dispE: 0 }, { prof: "3.0", dispD: 0, dispE: 0 }] },
      ...extra,
    },
    "2026-10-20"
  );

describe("sessões do pacote", () => {
  it("plano sem os campos de sessão abre com 1 sessão e sessão 1", () => {
    const v = normalizarPlano({ saldoTotal: "8000" });
    expect(v.sessoesTotal).toBe(1);
    expect(v.sessaoAtual).toBe(1);
    expect(v.sessoesAnteriores).toEqual([]);
    expect(situacaoSaldo(v).paraProximas).toBe(0);
  });
  it("16.000 de pacote em 2 sessões, 10.000 distribuídos: ficam 6.000 para a segunda", () => {
    const p = pacote();
    expect(totalDistribuido(p)).toBe(1000 + 2400 + 2400 + 2400 + 2400 + 600);
    const base = pacote({ DATA: { jowls: [{ prof: "3.0", dispD: 5000, dispE: 5000 }] } });
    const s = situacaoSaldo(base);
    expect(s.total).toBe(10000);
    expect(s.resta).toBe(6000);
    expect(s.paraProximas).toBe(6000);
    expect(s.estado).toBe("ok");
    expect(s.disponivel).toBe(16000);
  });
  it("na última sessão o que sobra é saldo restante, sem crédito para próximas", () => {
    const p = pacote({ sessoesTotal: 1 });
    expect(situacaoSaldo(p).paraProximas).toBe(0);
  });
  const dezMil = () => pacote({ DATA: { jowls: [{ prof: "3.0", dispD: 5000, dispE: 5000 }] } });
  it("fecharSessao guarda a sessão, abre a 2 vazia na data do retorno e o saldo dela é 6.000", () => {
    const p = dezMil();
    const f = fecharSessao(p, "2026-10-21")!;
    expect(f.sessaoAtual).toBe(2);
    expect(f.sessoesAnteriores).toHaveLength(1);
    expect(f.sessoesAnteriores[0]).toMatchObject({ n: 1, data: "2026-10-20" });
    expect(f.sessoesAnteriores[0].DATA.jowls).toEqual([{ prof: "3.0", dispD: 5000, dispE: 5000 }]);
    expect(totalDistribuido(f)).toBe(0);
    expect(f.data).toBe("2026-12-19");
    expect(f.dataRetorno).toBe("");
    expect(f.customAreas).toEqual([]);
    const s = situacaoSaldo(f);
    expect(s.anteriores).toBe(10000);
    expect(s.disponivel).toBe(6000);
    expect(s.resta).toBe(6000);
    expect(s.paraProximas).toBe(0); // última sessão: é saldo restante
  });
  it("fecharSessao sem retorno marcado usa a data de hoje", () => {
    expect(fecharSessao({ ...dezMil(), dataRetorno: "" }, "2026-10-21")!.data).toBe("2026-10-21");
  });
  it("fecharSessao devolve nulo na última sessão e sem disparos", () => {
    expect(fecharSessao(pacote({ sessoesTotal: 1 }))).toBeNull();
    expect(fecharSessao(normalizarPlano({ saldoTotal: "16000", sessoesTotal: 2 }))).toBeNull();
    const f = fecharSessao(dezMil())!;
    expect(fecharSessao(f)).toBeNull(); // sessão 2 de 2 e vazia
  });
  it("reabrirSessaoAnterior desfaz o fechamento", () => {
    const p = dezMil();
    const f = fecharSessao(p)!;
    const r = reabrirSessaoAnterior(f)!;
    expect(r.sessaoAtual).toBe(1);
    expect(r.sessoesAnteriores).toEqual([]);
    expect(r.DATA).toEqual(p.DATA);
    expect(r.data).toBe(p.data);
    expect(reabrirSessaoAnterior(p)).toBeNull();
  });
  it("ida e volta mantém as sessões", () => {
    const f = fecharSessao(dezMil())!;
    expect(normalizarPlano(paraEstado(f))).toEqual(f);
    const e = paraEstado(f) as Record<string, unknown>;
    expect(e.sessoesTotal).toBe(2);
    expect(e.sessaoAtual).toBe(2);
  });
  it("planoDaSessao e contaDaSessao", () => {
    const f = fecharSessao(dezMil())!;
    expect(planoDaSessao(f, 2)).toBe(f);
    expect(planoDaSessao(f, 1)!.data).toBe("2026-10-20");
    expect(totalDistribuido(planoDaSessao(f, 1)!)).toBe(10000);
    expect(planoDaSessao(f, 7)).toBeNull();
    expect(contaDaSessao(f, 1)).toMatchObject({ pacote: 16000, antes: 0, nesta: 10000, resta: 6000, ultima: false });
    expect(contaDaSessao(f, 2)).toMatchObject({ antes: 10000, nesta: 0, resta: 6000, ultima: true });
  });
  it("texto do resumo mostra sessão, pacote e o que fica para a próxima", () => {
    const t = textoResumo(dezMil(), new Date(2026, 9, 20, 10, 0));
    expect(t).toContain("Sessão:       1 de 2");
    expect(t).toContain("Pacote:       16.000 disparos");
    expect(t).toContain("Nesta sessão: 10.000 disparos");
    expect(t).toContain("Para a próxima sessão: 6.000 disparos");
    const um = textoResumo(normalizarPlano({ saldoTotal: "8000" }), new Date(2026, 9, 20, 10, 0));
    expect(um).toContain("Saldo total:  8.000 disparos");
    expect(um).not.toContain("Sessão:");
  });
  it("ficha da sessão 1 mostra Sessão 1 de 2, o pacote e 6.000 para a segunda", () => {
    const h = htmlFichaPaciente(dezMil(), "", new Date(2026, 9, 20, 10, 0), 1);
    expect(h).toContain("Sessão 1 de 2");
    expect(h).toContain("Disparos do pacote");
    expect(h).toContain("16.000");
    expect(h).toContain("10.000");
    expect(h).toContain("Fica para a Sessão 2");
    expect(h).toContain("6.000");
    expect(h).toContain("Assinatura do Paciente");
  });
  it("ficha de uma sessão fechada usa os dados dela, com a data da sessão seguinte como retorno", () => {
    const f = fecharSessao(dezMil())!;
    const h = htmlFichaPaciente(f, "", new Date(2026, 9, 20, 10, 0), 1);
    expect(h).toContain("Sessão 1 de 2");
    expect(h).toContain("20/10/2026");
    expect(h).toContain("19/12/2026");
    expect(h).toContain("Jowls");
  });
  it("ficha de plano com 1 sessão não mostra o bloco do pacote", () => {
    const h = htmlFichaPaciente(normalizarPlano({ saldoTotal: "8000", DATA: { jowls: [{ prof: "3.0", dispD: 100, dispE: 100 }] } }));
    expect(h).not.toContain("Disparos do pacote");
    expect(h).not.toContain("Sessão 1 de");
  });
  it("prontuário com várias sessões mostra o pacote no resumo", () => {
    const h = htmlProntuario(dezMil());
    expect(h).toContain("Sessão 1 de 2");
    expect(h).toContain("Fica para a Sessão 2");
  });
});
