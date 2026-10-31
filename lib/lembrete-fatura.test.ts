import { describe, expect, it } from "vitest";
import { lembretesDeFatura, linkImportarFatura, ultimoFechamento, type CartaoParaLembrete } from "./lembrete-fatura";

const nubank: CartaoParaLembrete = {
  id: "c1",
  nome: "NUBANK (Empresa)",
  scope: "harmonize",
  dia_fechamento: 25,
  dia_vencimento: 2,
  // Importou a fatura anterior em 26/10 às 10h de Brasília.
  ultimaImportacao: "2026-10-26T13:00:00Z",
};

describe("ultimoFechamento", () => {
  it("no dia do fechamento ainda vale o do mês anterior", () => {
    expect(ultimoFechamento("2026-11-25", 25)).toBe("2026-10-25");
    expect(ultimoFechamento("2026-11-26", 25)).toBe("2026-11-25");
  });
  it("limita ao último dia em mês curto", () => {
    expect(ultimoFechamento("2026-03-01", 30)).toBe("2026-02-28");
    expect(ultimoFechamento("2028-03-01", 30)).toBe("2028-02-29");
  });
  it("vira o ano", () => {
    expect(ultimoFechamento("2027-01-10", 25)).toBe("2026-12-25");
  });
});

describe("lembretesDeFatura", () => {
  it("antes do fechamento não avisa", () => {
    expect(lembretesDeFatura("2026-11-20", [nubank])).toEqual([]);
    expect(lembretesDeFatura("2026-11-25", [nubank])).toEqual([]);
  });

  it("no dia seguinte ao fechamento avisa, com a fatura do vencimento", () => {
    expect(lembretesDeFatura("2026-11-26", [nubank])).toEqual([
      { cartaoId: "c1", nome: "NUBANK (Empresa)", scope: "harmonize", fechamento: "2026-11-25", faturaRef: "2026-12", diasDesdeFechamento: 1 },
    ]);
  });

  it("importou depois do fechamento: some", () => {
    const c = { ...nubank, ultimaImportacao: "2026-11-26T14:00:00Z" };
    expect(lembretesDeFatura("2026-11-26", [c])).toEqual([]);
    expect(lembretesDeFatura("2026-12-10", [c])).toEqual([]);
  });

  it("importação no próprio dia do fechamento não conta", () => {
    const c = { ...nubank, ultimaImportacao: "2026-11-25T15:00:00Z" };
    expect(lembretesDeFatura("2026-11-27", [c])).toHaveLength(1);
  });

  it("usa o dia de Brasília da importação (23h de 25/11 em Brasília é 26/11 em UTC)", () => {
    const c = { ...nubank, ultimaImportacao: "2026-11-26T02:00:00Z" };
    expect(lembretesDeFatura("2026-11-27", [c])).toHaveLength(1);
  });

  it("cartão sem importação nunca avisa", () => {
    expect(lembretesDeFatura("2026-11-28", [{ ...nubank, ultimaImportacao: null }])).toEqual([]);
  });

  it("fevereiro com fechamento 30 fecha no último dia", () => {
    const c = { ...nubank, dia_fechamento: 30, dia_vencimento: 7, ultimaImportacao: "2027-01-31T12:00:00Z" };
    expect(lembretesDeFatura("2027-02-28", [c])).toEqual([]);
    const [l] = lembretesDeFatura("2027-03-02", [c]);
    expect(l.fechamento).toBe("2027-02-28");
    expect(l.faturaRef).toBe("2027-03");
    expect(l.diasDesdeFechamento).toBe(2);
  });

  it("virada de ano: fechou 25/12, vence 2/1 do ano seguinte", () => {
    const c = { ...nubank, ultimaImportacao: "2026-11-27T12:00:00Z" };
    const [l] = lembretesDeFatura("2027-01-03", [c]);
    expect(l.fechamento).toBe("2026-12-25");
    expect(l.faturaRef).toBe("2027-01");
    expect(l.diasDesdeFechamento).toBe(9);
  });

  it("link abre a tela do espaço certo com a importação", () => {
    const [l] = lembretesDeFatura("2026-11-26", [nubank]);
    expect(linkImportarFatura(l)).toBe("/financeiro/cartoes?cartao=c1&fatura=2026-12&importar=1");
    expect(linkImportarFatura({ ...l, scope: "pessoal" })).toBe("/pessoal/cartoes?cartao=c1&fatura=2026-12&importar=1");
  });
});
