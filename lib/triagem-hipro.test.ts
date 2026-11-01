import { describe, expect, it } from "vitest";
import { TERMO_TEXTO, TERMO_VERSAO } from "./consentimento-hipro";
import { CONTRAINDICACOES, RESPOSTAS_VAZIAS, classificarTriagem, lerTriagem, registroDaTriagem, textoTriagemImpressao } from "./triagem-hipro";

const com = (ids: string[], extra: Partial<typeof RESPOSTAS_VAZIAS> = {}) => ({
  ...RESPOSTAS_VAZIAS,
  marcadas: Object.fromEntries(ids.map((i) => [i, true])),
  ...extra,
});

describe("lista de contraindicações", () => {
  it("tem as 9 absolutas e as 3 relativas do e-book, com ids únicos", () => {
    expect(CONTRAINDICACOES.filter((c) => c.tipo === "absoluta")).toHaveLength(9);
    expect(CONTRAINDICACOES.filter((c) => c.tipo === "relativa").map((c) => c.id)).toEqual(["anticoagulante", "preenchimento", "queloide"]);
    expect(new Set(CONTRAINDICACOES.map((c) => c.id)).size).toBe(CONTRAINDICACOES.length);
  });
  it("textos sem travessão", () => {
    for (const c of CONTRAINDICACOES) expect(`${c.texto} ${c.detalhe ?? ""}`).not.toMatch(/[—–]/);
  });
});

describe("classificarTriagem", () => {
  it("nada marcado: sem contraindicações e pode seguir", () => {
    const c = classificarTriagem(RESPOSTAS_VAZIAS);
    expect(c.situacao).toBe("sem");
    expect(c.podeSeguir).toBe(true);
    expect(c.texto).toBe("Sem contraindicações declaradas");
  });
  it("relativa pede a liberação da profissional", () => {
    expect(classificarTriagem(com(["queloide"])).podeSeguir).toBe(false);
    const ok = classificarTriagem(com(["queloide"], { relativaLiberada: true }));
    expect(ok.situacao).toBe("relativa");
    expect(ok.podeSeguir).toBe(true);
  });
  it("absoluta bloqueia até a confirmação explícita, mesmo com relativa liberada", () => {
    const c = classificarTriagem(com(["gestante", "queloide"], { relativaLiberada: true }));
    expect(c.situacao).toBe("absoluta");
    expect(c.podeSeguir).toBe(false);
    expect(c.texto).toBe("Contraindicação absoluta: o procedimento não deve ser feito");
    expect(classificarTriagem(com(["gestante"], { absolutaConfirmada: true })).podeSeguir).toBe(true);
  });
  it("id desconhecido é ignorado", () => {
    expect(classificarTriagem(com(["xyz"])).situacao).toBe("sem");
  });
});

describe("registro e leitura", () => {
  const agora = new Date("2026-11-01T15:00:00Z");
  it("guarda o termo, as marcadas e só confirma o que existe", () => {
    const r = registroDaTriagem(com(["anticoagulante"], { relativaLiberada: true, absolutaConfirmada: true, disparoTeste: true }), true, agora);
    expect(r.situacao).toBe("relativa");
    expect(r.relativas).toEqual(["anticoagulante"]);
    expect(r.absolutaConfirmada).toBe(false);
    expect(r.termo).toMatchObject({ versao: TERMO_VERSAO, aceito: true, texto: TERMO_TEXTO });
    expect(r.em).toBe("2026-11-01T15:00:00.000Z");
  });
  it("lê da coluna ou de resumo.triagem (antes do SQL) e devolve nulo sem triagem", () => {
    const r = registroDaTriagem(RESPOSTAS_VAZIAS, true, agora);
    expect(lerTriagem({ triagem: r })).toEqual(r);
    expect(lerTriagem({ triagem: null, resumo: { triagem: r } })).toEqual(r);
    expect(lerTriagem({ triagem: null, resumo: { paciente: "Ana" } })).toBeNull();
    expect(lerTriagem(null)).toBeNull();
  });
  it("texto da impressão", () => {
    expect(textoTriagemImpressao(registroDaTriagem(RESPOSTAS_VAZIAS, true, agora))).toBe("Sem contraindicações declaradas. Disparo teste não registrado.");
    expect(textoTriagemImpressao(registroDaTriagem(com(["marcapasso"], { absolutaConfirmada: true, disparoTeste: true }), true, agora))).toBe(
      "Contraindicação absoluta confirmada pela profissional: Marcapasso ou dispositivo eletrônico implantado. Disparo teste realizado."
    );
  });
});

describe("ficha impressa", () => {
  it("mostra a triagem e o termo acima das assinaturas só quando há triagem", async () => {
    const { htmlFichaPaciente, htmlProntuario } = await import("./planejador-impressao");
    const { normalizarPlano } = await import("./planejador");
    const plano = normalizarPlano({ paciente: "Ana", data: "2026-11-01", saldoTotal: "1000", DATA: { frontal: [{ prof: "1.5", dispD: 500, dispE: 500 }] } });
    const base = { papel: "paciente" as const, nome: "Ana", registro: null, assinadaEm: "2026-11-01T15:00:00Z", src: "", hash: "a".repeat(64) };
    const t = registroDaTriagem(com(["queloide"], { relativaLiberada: true }), true, new Date("2026-11-01T15:00:00Z"));
    const ficha = htmlFichaPaciente(plano, "", new Date(), 1, undefined, { lista: [{ ...base, triagem: t }], hashAtual: null });
    expect(ficha).toContain("Triagem e consentimento");
    expect(ficha).toContain("Contraindicações relativas avaliadas pela profissional: Histórico de queloide.");
    expect(ficha).toContain(`versão ${TERMO_VERSAO}`);
    expect(ficha.indexOf("Triagem e consentimento")).toBeLessThan(ficha.indexOf("pront-footer"));
    expect(htmlProntuario(plano, "", new Date(), undefined, { lista: [{ ...base, triagem: t }], hashAtual: null })).toContain("Triagem e consentimento");
    expect(htmlFichaPaciente(plano, "", new Date(), 1, undefined, { lista: [base], hashAtual: null })).not.toContain("Triagem e consentimento");
  });
});
