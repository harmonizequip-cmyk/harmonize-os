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
