import { describe, expect, it } from "vitest";
import { candidatosIndicacao, descontoParaUsar, mensagemLinkIndicacao, situacaoDesconto, tempoRestante } from "./indicacao";

describe("descontos", () => {
  const d = (valido_ate: string, usado_em: string | null = null) => ({ valido_ate, usado_em });
  it("situação", () => {
    expect(situacaoDesconto(d("2026-12-01"), "2026-11-02")).toBe("disponivel");
    expect(situacaoDesconto(d("2026-11-01"), "2026-11-02")).toBe("vencido");
    expect(situacaoDesconto(d("2026-12-01", "x"), "2026-11-02")).toBe("usado");
  });
  it("usa o que vence primeiro e ignora usado e vencido", () => {
    const lista = [d("2027-01-10"), d("2026-12-01", "x"), d("2026-11-20"), d("2026-10-01")];
    expect(descontoParaUsar(lista, "2026-11-02")?.valido_ate).toBe("2026-11-20");
    expect(descontoParaUsar([], "2026-11-02")).toBeNull();
  });
});

describe("candidatosIndicacao", () => {
  const cs = [
    { id: "1", name: "MARIA ANGELA SOUZA" },
    { id: "2", name: "MARIA ANGELA" },
    { id: "3", name: "ANA MARIA", display_name: "Ângela" },
    { id: "4", name: "JOSE" },
  ];
  it("acha por todas as palavras, sem acento, exato primeiro", () => {
    expect(candidatosIndicacao("Maria Ângela", cs).map((c) => c.id)).toEqual(["2", "1"]);
    expect(candidatosIndicacao("angela", cs).map((c) => c.id)).toEqual(["3", "2", "1"]);
    expect(candidatosIndicacao("Fulana", cs)).toEqual([]);
    expect(candidatosIndicacao("Maria Ângela", cs, "2").map((c) => c.id)).toEqual(["1"]);
  });
});

describe("tempoRestante", () => {
  it("conta dias, horas, minutos e acaba", () => {
    const agora = Date.parse("2026-11-02T10:00:00Z");
    expect(tempoRestante("2026-11-09T10:00:00Z", agora)).toMatchObject({ dias: 7, horas: 0, acabou: false });
    expect(tempoRestante("2026-11-02T11:30:15Z", agora)).toMatchObject({ dias: 0, horas: 1, minutos: 30, segundos: 15 });
    expect(tempoRestante("2026-11-01T10:00:00Z", agora).acabou).toBe(true);
  });
});

describe("mensagemLinkIndicacao", () => {
  it("leva o link e os 10%", () => {
    const m = mensagemLinkIndicacao("Olá, Dra. Ana!", "https://x/indicacao/abc");
    expect(m).toContain("https://x/indicacao/abc");
    expect(m).toContain("10%");
  });
});

import { descontosVencendo, diasParaVencer, indicadasSemContato, mensagemBoasVindasIndicacao, mensagemDescontoVencendo, textoVencimento } from "./indicacao";

describe("avisos com urgência", () => {
  const d = (id: string, valido_ate: string, usado_em: string | null = null) => ({ id, valido_ate, usado_em });
  it("conta os dias até vencer", () => {
    expect(diasParaVencer("2026-11-06", "2026-11-06")).toBe(0);
    expect(diasParaVencer("2026-12-01", "2026-11-30")).toBe(1);
  });
  it("lista só os disponíveis que vencem em até 3 dias, o mais urgente primeiro", () => {
    const r = descontosVencendo([d("a", "2026-11-09"), d("b", "2026-11-07"), d("c", "2026-11-10"), d("e", "2026-11-05"), d("f", "2026-11-06", "2026-11-01")], "2026-11-06");
    expect(r.map((x) => [x.id, x.dias])).toEqual([["b", 1], ["a", 3]]);
  });
  it("texto do prazo", () => {
    expect(textoVencimento(0, "2026-11-06")).toBe("vence hoje");
    expect(textoVencimento(1, "2026-11-07")).toBe("vence amanhã (07/11)");
    expect(textoVencimento(3, "2026-11-09")).toBe("vence em 3 dias (09/11)");
  });
  it("mensagens sem travessão e com o prazo", () => {
    const m1 = mensagemDescontoVencendo({ saudacao: "Olá, Dra. Ana!", tipo: "indicado", dias: 1, validoAte: "2026-11-07", outroNome: "Bia" });
    const m2 = mensagemDescontoVencendo({ saudacao: "Olá!", tipo: "indicou", dias: 0, validoAte: "2026-11-06" });
    const m3 = mensagemBoasVindasIndicacao({ saudacao: "Olá!", indicadora: "Bia", validoAte: "2026-12-01" });
    expect(m1).toContain("vence amanhã (07/11)");
    expect(m1).toContain("por indicação de Bia");
    expect(m2).toContain("Hoje é o último dia");
    expect(m3).toContain("válido até 01/12");
    for (const m of [m1, m2, m3]) expect(m).not.toMatch(/—/);
  });
  it("indicadas novas sem contato", () => {
    const l = [
      { id: "a", created_at: "2026-11-05T10:00:00Z" },
      { id: "b", created_at: "2026-10-01T10:00:00Z" },
      { id: "c", created_at: "2026-11-04T10:00:00Z", is_client: true },
      { id: "d", created_at: "2026-11-03T10:00:00Z" },
    ];
    expect(indicadasSemContato(l, new Set(["d"]), "2026-11-06").map((x) => x.id)).toEqual(["a"]);
  });
});
