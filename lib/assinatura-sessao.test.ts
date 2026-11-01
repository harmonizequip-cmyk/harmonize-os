import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizarPlano } from "./planejador";
import {
  assinaturaVazia,
  caixaDosTracos,
  caminhoAssinatura,
  dataHoraCompleta,
  dataHoraCurta,
  escalaParaCaber,
  hashDoResumo,
  jsonCanonico,
  resumoDaSessao,
  situacaoAssinaturas,
  textoParaHash,
  type AssinaturaSessao,
} from "./assinatura-sessao";

// Pacote de 16.000 em 2 sessões: 10.000 na primeira (fechada), 4.000 na segunda (aberta).
const plano = normalizarPlano({
  paciente: "  Ana   Souza ",
  data: "2026-12-19",
  saldoTotal: "16000",
  procNome: "Full Face",
  profissional: "Dra. Bia",
  sessoesTotal: 2,
  sessaoAtual: 2,
  sessoesAnteriores: [{ n: 1, data: "2026-10-20", DATA: { frontal: [{ prof: "1.5", dispD: 500, dispE: 500 }], papada: [{ prof: "10.0", disp: 9000 }] }, customAreas: [] }],
  DATA: { jowls: [{ prof: "4.5", dispD: 1000, dispE: 1000, feito: true }], pescoco: [{ prof: "4.5", dispD: 1000, dispE: 1000 }] },
});

const assinatura = (papel: "paciente" | "profissional", hash: string, em: string): AssinaturaSessao => ({
  id: papel,
  planejamento_id: "p1",
  sessao: 1,
  papel,
  nome: papel,
  profissional_id: null,
  registro: null,
  imagem: "x",
  conteudo_hash: hash,
  resumo: null,
  assinada_em: em,
});

describe("resumo da sessão", () => {
  it("sessão fechada: data, áreas com linhas, total e o que fica para a próxima", () => {
    const r = resumoDaSessao(plano, 1)!;
    expect(r.paciente).toBe("Ana Souza");
    expect(r.data).toBe("2026-10-20");
    expect(r.total).toBe(10000);
    expect(r.saldo).toBe(6000);
    expect(r.areas.map((a) => a.id)).toEqual(["papada", "frontal"]);
    expect(r.areas[0].linhas).toEqual([{ prof: "10.0", disp: 9000, total: 9000 }]);
    expect(r.areas[1].linhas).toEqual([{ prof: "1.5", d: 500, e: 500, total: 1000 }]);
  });

  it("sessão aberta (a última): saldo é o restante; sessão que não existe dá nulo", () => {
    const r = resumoDaSessao(plano, 2)!;
    expect(r.total).toBe(4000);
    expect(r.saldo).toBe(2000);
    expect(resumoDaSessao(plano, 5)).toBeNull();
  });
});

describe("conferência do conteúdo", () => {
  it("JSON canônico não depende da ordem das chaves", () => {
    expect(jsonCanonico({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[2,{"y":2,"z":1}]},"b":1}');
  });

  it("sha256 igual ao do Node e muda quando muda um disparo", async () => {
    const r = resumoDaSessao(plano, 1)!;
    const h = await hashDoResumo(r);
    expect(h).toBe(createHash("sha256").update(textoParaHash(r)).digest("hex"));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    const mudado = normalizarPlano({
      ...(plano as unknown as Record<string, unknown>),
      sessoesAnteriores: [{ n: 1, data: "2026-10-20", DATA: { frontal: [{ prof: "1.5", dispD: 500, dispE: 450 }], papada: [{ prof: "10.0", disp: 9000 }] }, customAreas: [] }],
    });
    expect(await hashDoResumo(resumoDaSessao(mudado, 1)!)).not.toBe(h);
  });

  it("marcar 'feito', trocar procedimento ou profissional não muda a conferência", () => {
    const outro = { ...plano, procNome: "Outro", profissional: "Dra. Outra" };
    outro.DATA = { ...plano.DATA, jowls: [{ prof: "4.5", dispD: 1000, dispE: 1000 }] };
    expect(textoParaHash(resumoDaSessao(outro, 2)!)).toBe(textoParaHash(resumoDaSessao(plano, 2)!));
  });
});

describe("situação das assinaturas", () => {
  it("as duas com o mesmo conteúdo: assinada; conteúdo diferente: alterada", () => {
    const lista = [assinatura("paciente", "h1", "2026-10-31T17:05:00Z"), assinatura("profissional", "h1", "2026-10-31T17:06:00Z")];
    const ok = situacaoAssinaturas(lista, "h1")!;
    expect(ok.completa).toBe(true);
    expect(ok.alterada).toBe(false);
    expect(ok.texto).toBe("Assinada por paciente e profissional em 31/10 14:06");
    expect(situacaoAssinaturas(lista, "h2")!.texto).toBe("Alterada depois de assinada");
    expect(situacaoAssinaturas(lista, null)!.alterada).toBe(false);
    expect(situacaoAssinaturas([lista[0]], "h1")!.texto).toBe("Assinada só pelo paciente em 31/10 14:05");
    expect(situacaoAssinaturas([], "h1")).toBeNull();
  });

  it("datas no horário de Brasília e caminho do arquivo", () => {
    expect(dataHoraCurta("2026-11-01T01:30:00Z")).toBe("31/10 22:30");
    expect(dataHoraCompleta("2026-11-01T01:30:00Z")).toBe("31/10/2026 às 22:30");
    expect(caminhoAssinatura("p1", 2, "paciente", "abc")).toBe("s/p1/2/paciente-abc.png");
  });
});

describe("imagem da assinatura", () => {
  it("recorte com folga, escala sem aumentar e toque sem querer", () => {
    const tracos = [
      [
        { x: 50, y: 40 },
        { x: 150, y: 90 },
      ],
      [{ x: 120, y: 30 }],
    ];
    expect(caixaDosTracos(tracos, 10)).toEqual({ x: 40, y: 20, w: 120, h: 80 });
    expect(caixaDosTracos([])).toBeNull();
    expect(escalaParaCaber(1200, 300, 600, 240)).toBe(0.5);
    expect(escalaParaCaber(100, 50, 600, 240)).toBe(1);
    expect(assinaturaVazia([[{ x: 1, y: 1 }]])).toBe(true);
    const rabisco = Array.from({ length: 20 }, (_, i) => ({ x: i * 10, y: (i % 3) * 15 }));
    expect(assinaturaVazia([rabisco])).toBe(false);
  });
});

describe("impressão com assinaturas", async () => {
  const { htmlFichaPaciente, htmlProntuario } = await import("./planejador-impressao");
  const assinada = {
    lista: [
      { papel: "paciente" as const, nome: "Ana Souza", registro: null, assinadaEm: "2026-10-31T17:05:00Z", src: "data:image/png;base64,AAA", hash: "abcdef1234" + "0".repeat(54) },
      { papel: "profissional" as const, nome: "Dra. Bia", registro: "CRBM 1234", assinadaEm: "2026-10-31T17:06:00Z", src: "data:image/png;base64,BBB", hash: "abcdef1234" + "0".repeat(54) },
    ],
    hashAtual: "abcdef1234" + "0".repeat(54),
  };

  it("sem assinatura, as linhas em branco de sempre; com assinatura, imagem, nome, registro, data e conferência", () => {
    const sem = htmlFichaPaciente(plano, "", new Date(), 1);
    expect(sem).toContain("Assinatura do Paciente · Sessão 1");
    expect(sem).not.toContain("Conteúdo verificado");
    const com = htmlFichaPaciente(plano, "", new Date(), 1, undefined, assinada);
    expect(com).toContain('src="data:image/png;base64,AAA"');
    expect(com).toContain("CRBM 1234");
    expect(com).toContain("Assinado em 31/10/2026 às 14:05");
    expect(com).toContain("Conteúdo verificado: abcdef12");
    expect(com).not.toContain("alterada depois");
    const mudou = htmlFichaPaciente(plano, "", new Date(), 1, undefined, { ...assinada, hashAtual: "f".repeat(64) });
    expect(mudou).toContain("a sessão foi alterada depois de assinada");
  });

  it("prontuário só ganha o bloco quando há assinatura e mostra o registro da profissional", () => {
    expect(htmlProntuario(plano)).not.toContain("Assinatura do Paciente");
    expect(htmlProntuario({ ...plano, profissionalRegistro: "CRBM 9" })).toContain("Dra. Bia · CRBM 9");
    expect(htmlProntuario(plano, "", new Date(), undefined, assinada)).toContain("Conteúdo verificado: abcdef12");
  });
});
