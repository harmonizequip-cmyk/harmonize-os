import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { montarXlsx, serialDeData } from "./planilha-xlsx";

type L = { data: string; nome: string; valor: number; qtd: number };

const linhas: L[] = [
  { data: "01/10/2026", nome: "Dra. Ana & Cia <x>", valor: 1500.5, qtd: 2 },
  { data: "15/10/2026", nome: "Dr. Bruno", valor: 250, qtd: 1 },
];

function abrir() {
  const zip = unzipSync(
    montarXlsx<L>({
      titulo: "Locações",
      periodo: "outubro de 2026",
      linhas,
      colunas: [
        { titulo: "Data", valor: (l) => l.data, tipo: "data" },
        { titulo: "Cliente", valor: (l) => l.nome },
        { titulo: "Valor", valor: (l) => l.valor, tipo: "moeda", total: true },
        { titulo: "Qtd", valor: (l) => l.qtd, tipo: "inteiro", total: true },
      ],
      resumo: [{ rotulo: "Entradas", valor: 1750.5 }],
      geradoEm: new Date(2026, 9, 13, 15, 30),
    })
  );
  return Object.fromEntries(Object.entries(zip).map(([k, v]) => [k, strFromU8(v)]));
}

describe("montarXlsx", () => {
  it("gera as partes do arquivo", () => {
    const f = abrir();
    expect(Object.keys(f).sort()).toEqual(
      ["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/sharedStrings.xml", "xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort()
    );
  });

  it("escapa texto, converte data e soma o total", () => {
    const f = abrir();
    expect(f["xl/sharedStrings.xml"]).toContain("Dra. Ana &amp; Cia &lt;x&gt;");
    expect(f["xl/sharedStrings.xml"]).toContain("Harmonize · Locações");
    expect(f["xl/sharedStrings.xml"]).toContain("outubro de 2026 · 2 linhas · gerado em 13/10/2026 15:30");
    const planilha = f["xl/worksheets/sheet1.xml"];
    expect(planilha).toContain(`<v>${serialDeData("01/10/2026")}</v>`);
    expect(planilha).toMatch(/<f>SUM\(C\d+:C\d+\)<\/f><v>1750.5<\/v>/);
    expect(planilha).toMatch(/<f>SUM\(D\d+:D\d+\)<\/f><v>3<\/v>/);
    expect(planilha).toContain('state="frozen"');
    expect(f["xl/workbook.xml"]).toMatch(/'Locações'!\$A\$\d+:\$D\$\d+/);
  });

  it("serial de data igual ao do Excel", () => {
    expect(serialDeData("01/01/2026")).toBe(46023);
    expect(serialDeData("2026-01-01")).toBeNull();
  });
});
