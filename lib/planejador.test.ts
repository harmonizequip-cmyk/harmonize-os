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
import { DEFAULT_PREFERENCIAS } from "./preferencias";

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
  it("submandibular com direito e esquerdo fica na própria área e a nasolabial manual vai para o jowls", () => {
    const q = normalizarPlano({
      customAreas: [{ id: "custom_1", nome: "Nasolabial", bilateral: true, regiao: "facial" }],
      DATA: { submandibular: [{ prof: "4.5", dispD: 600, dispE: 700 }], papada: [{ prof: "10.0", disp: 800 }], custom_1: [{ prof: "4.5", dispD: 400, dispE: 400 }] },
    });
    expect(q.DATA.submandibular).toEqual([{ prof: "4.5", dispD: 600, dispE: 700 }]);
    expect(q.DATA.papada).toEqual([{ prof: "10.0", disp: 800 }]);
    expect(q.DATA.jowls).toEqual([{ prof: "4.5", dispD: 400, dispE: 400 }]);
    expect(q.customAreas).toEqual([]);
  });
  it("linha da submandibular salva como campo único (versão de 19/10) é dividida entre os lados", () => {
    const q = normalizarPlano({ DATA: { submandibular: [{ prof: "3.0", disp: 900 }], papada: [{ prof: "10.0", disp: 800 }] } });
    expect(q.DATA.submandibular).toEqual([{ prof: "3.0", dispD: 450, dispE: 450 }]);
    expect(q.DATA.papada).toEqual([{ prof: "10.0", disp: 800 }]);
  });
  it("Papada é campo único e Submandibular tem direito e esquerdo (600 a 1.200 por lado)", () => {
    const pap = AREAS_FIXAS.find((a) => a.id === "papada")!;
    const sub = AREAS_FIXAS.find((a) => a.id === "submandibular")!;
    expect(pap.nome).toBe("Papada");
    expect(sub.nome).toBe("Submandibular");
    expect(pap.bilateral).toBe(false);
    expect(sub.bilateral).toBe(true);
    const acima = normalizarPlano({ DATA: { submandibular: [{ prof: "4.5", dispD: 1300, dispE: 1200 }] } });
    expect(alertas(acima).some((x) => x.areaId === "submandibular" && /1\.200 por lado/.test(x.texto) && /máximo/.test(x.texto))).toBe(true);
    const abaixo = normalizarPlano({ DATA: { submandibular: [{ prof: "4.5", dispD: 1200, dispE: 500 }] } });
    expect(alertas(abaixo).some((x) => x.areaId === "submandibular" && /mínimo \(600 por lado\)/.test(x.texto))).toBe(true);
    const ok = normalizarPlano({ DATA: { submandibular: [{ prof: "4.5", dispD: 600, dispE: 1200 }], arcomandibular: [{ prof: "3.0", dispD: 800, dispE: 800 }] } });
    expect(alertas(ok).filter((x) => x.areaId === "submandibular" || x.areaId === "arcomandibular")).toEqual([]);
    const semDisparo = normalizarPlano({ DATA: { arcomandibular: [{ prof: "3.0", dispD: 0, dispE: 0 }] } });
    expect(alertas(semDisparo).some((x) => x.areaId === "arcomandibular")).toBe(false);
    const terco = normalizarPlano({ DATA: { arcomandibular: [{ prof: "3.0", dispD: 100, dispE: 800 }] } });
    expect(alertas(terco).some((x) => x.areaId === "arcomandibular" && /mínimo/.test(x.texto))).toBe(true);
  });
  it("Jowls só tem 4,5 mm e passa do máximo acima de 1.500 por lado", () => {
    const jowls = AREAS_FIXAS.find((a) => a.id === "jowls")!;
    expect(jowls.opts).toEqual(["4.5"]);
    const q = normalizarPlano({ DATA: { jowls: [{ prof: "4.5", dispD: 1600, dispE: 1500 }] } });
    expect(alertas(q).some((x) => x.areaId === "jowls" && /1\.500 por lado/.test(x.texto))).toBe(true);
    const ok = normalizarPlano({ DATA: { jowls: [{ prof: "4.5", dispD: 1500, dispE: 1500 }] } });
    expect(alertas(ok).some((x) => x.areaId === "jowls")).toBe(false);
  });
  it("Temporal e Arco Zigomático saiu: só existe Pálpebras e lateral dos olhos, até 500 por lado", () => {
    expect(AREAS_FIXAS.some((a) => a.id === "temporal")).toBe(false);
    const olhos = AREAS_FIXAS.find((a) => a.id === "olhos")!;
    expect(olhos.nome).toBe("Pálpebras inferiores e lateral dos olhos");
    expect(olhos.bilateral).toBe(true);
    const ok = normalizarPlano({ DATA: { olhos: [{ prof: "1.5", dispD: 500, dispE: 500 }] } });
    expect(alertas(ok).some((x) => x.areaId === "olhos")).toBe(false);
    const acima = normalizarPlano({ DATA: { olhos: [{ prof: "1.5", dispD: 600, dispE: 500 }] } });
    expect(alertas(acima).some((x) => x.areaId === "olhos" && /500 por lado/.test(x.texto))).toBe(true);
  });
  it("o que estava em Temporal (e na área manual de olhos) vai para Pálpebras e lateral dos olhos, sem perder disparos", () => {
    const q = normalizarPlano({
      customAreas: [{ id: "custom_1", nome: "Pálpebras inferiores e lateral dos olhos", bilateral: true, regiao: "facial" }],
      DATA: { temporal: [{ prof: "1.5", dispD: 400, dispE: 400 }], custom_1: [{ prof: "4.5", dispD: 300, dispE: 300 }] },
      sessoesAnteriores: [{ n: 1, data: "2026-10-01", DATA: { temporal: [{ prof: "1.5", dispD: 200, dispE: 200 }] } }],
    });
    expect(q.DATA.temporal).toBeUndefined();
    expect(q.DATA.olhos).toEqual([
      { prof: "1.5", dispD: 400, dispE: 400 },
      { prof: "4.5", dispD: 300, dispE: 300 },
    ]);
    expect(q.customAreas).toEqual([]);
    expect(q.sessoesAnteriores[0].DATA.olhos).toEqual([{ prof: "1.5", dispD: 200, dispE: 200 }]);
    expect(totalDistribuido(q)).toBe(1400);
  });
  it("Frontal só tem uma profundidade (1,5 mm): mais de uma com disparos gera aviso", () => {
    const frontal = AREAS_FIXAS.find((a) => a.id === "frontal")!;
    expect(frontal.opts).toEqual(["1.5"]);
    const ok = normalizarPlano({ DATA: { frontal: [{ prof: "1.5", dispD: 500, dispE: 500 }] } });
    expect(alertas(ok).some((x) => x.areaId === "frontal")).toBe(false);
    const duas = normalizarPlano({ DATA: { frontal: [{ prof: "4.5", dispD: 300, dispE: 300 }, { prof: "1.5", dispD: 200, dispE: 200 }] } });
    expect(alertas(duas).some((x) => x.areaId === "frontal" && /só pode ter 1 profundidade/.test(x.texto))).toBe(true);
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
  it("rodapé dos documentos vem de Configurações (padrão = texto de antes; vazio some)", () => {
    const agora = new Date(2026, 9, 16, 10, 0);
    expect(htmlProntuario(p, "", agora)).toContain("· Harmonize · Locação de Equipamentos Médicos e Estéticos</div>");
    const cfg = { empresa: { ...DEFAULT_PREFERENCIAS.empresa, rodapeDocumentos: "Clínica <Nova>" } };
    expect(htmlFichaPaciente(p, "", agora, undefined, cfg)).toContain("· Clínica &lt;Nova&gt;</div>");
    const semRodape = { empresa: { ...DEFAULT_PREFERENCIAS.empresa, rodapeDocumentos: "" } };
    expect(htmlProntuario(p, "", agora, semRodape)).not.toContain("Harmonize · Locação");
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
