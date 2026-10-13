// ============================================================
// PLANILHA .XLSX COM O LAYOUT DA HARMONIZE
//
// Monta o arquivo à mão (XML do Office + zip pelo fflate), sem biblioteca
// de planilha: fica leve e o visual é todo nosso. Abre igual no Google
// Planilhas e no Excel: título, período, resumo, cabeçalho nas cores da
// marca, linhas zebradas, valores em R$, datas de verdade (ordenáveis),
// filtro no cabeçalho, cabeçalho fixo e total no fim.
//
// Assim como o CSV, recebe as MESMAS linhas que estão na tela.
// ============================================================

import { zipSync, strToU8 } from "fflate";

export type TipoColuna = "texto" | "moeda" | "data" | "inteiro";

export interface ColunaPlanilha<T> {
  titulo: string;
  valor: (linha: T) => string | number | null | undefined;
  /** Padrão: texto. "data" aceita "dd/mm/aaaa" (vira data de verdade). */
  tipo?: TipoColuna;
  /** Soma a coluna na linha de total. */
  total?: boolean;
}

export interface ResumoPlanilha {
  rotulo: string;
  valor: number;
  tipo?: "moeda" | "inteiro";
}

export interface DadosPlanilha<T> {
  /** Nome da tela, ex.: "Financeiro". */
  titulo: string;
  /** Período legível, ex.: "outubro de 2026". */
  periodo?: string;
  linhas: T[];
  colunas: ColunaPlanilha<T>[];
  resumo?: ResumoPlanilha[];
  /** Data/hora da geração (para teste); padrão: agora. */
  geradoEm?: Date;
}

// Estilos (índice em cellXfs, ver estilosXml).
const S = {
  titulo: 1,
  subtitulo: 2,
  resumoRotulo: 3,
  resumoMoeda: 4,
  resumoInteiro: 5,
  cabecalho: 6,
  texto: [7, 8],
  moeda: [9, 10],
  data: [11, 12],
  inteiro: [13, 14],
  totalRotulo: 15,
  totalMoeda: 16,
  totalInteiro: 17,
  totalVazio: 18,
} as const;

function xml(texto: string): string {
  return texto
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function letraColuna(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** "dd/mm/aaaa" → número de série do Excel; outra coisa → null. */
export function serialDeData(texto: string): number | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const utc = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

function dataHoraBr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

class Textos {
  private mapa = new Map<string, number>();
  lista: string[] = [];
  indice(t: string): number {
    let i = this.mapa.get(t);
    if (i === undefined) {
      i = this.lista.length;
      this.lista.push(t);
      this.mapa.set(t, i);
    }
    return i;
  }
}

function estilosXml(): string {
  const moeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const borda = '<border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>';
  const xf = (numFmt: number, font: number, fill: number, border: number, extra = "") =>
    `<xf numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"${numFmt ? ' applyNumberFormat="1"' : ""} applyFont="1" applyFill="1" applyBorder="1"${extra ? ' applyAlignment="1"' : ""}>${extra}</xf>`;
  const meio = '<alignment vertical="center" indent="1"/>';
  const cab = '<alignment horizontal="center" vertical="center" wrapText="1"/>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="${xml(moeda)}"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="FF1F7A75"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1F2937"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1F7A75"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF3DBFB8"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF0FAF9"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFDEEF3"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="4">
<border><left/><right/><top/><bottom/><diagonal/></border>
${borda}
<border><left/><right/><top style="medium"><color rgb="FFE8789A"/></top><bottom style="thin"><color rgb="FFE8789A"/></bottom><diagonal/></border>
<border><left/><right/><top/><bottom style="medium"><color rgb="FF3DBFB8"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="19">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${xf(0, 1, 0, 3, meio)}
${xf(0, 2, 0, 0, meio)}
${xf(0, 3, 0, 0, meio)}
${xf(164, 5, 0, 0, meio)}
${xf(3, 5, 0, 0, meio)}
${xf(0, 4, 2, 1, cab)}
${xf(0, 0, 0, 1, meio)}
${xf(0, 0, 3, 1, meio)}
${xf(164, 0, 0, 1, meio)}
${xf(164, 0, 3, 1, meio)}
${xf(165, 0, 0, 1, '<alignment horizontal="center" vertical="center"/>')}
${xf(165, 0, 3, 1, '<alignment horizontal="center" vertical="center"/>')}
${xf(3, 0, 0, 1, meio)}
${xf(3, 0, 3, 1, meio)}
${xf(0, 3, 4, 2, meio)}
${xf(164, 3, 4, 2, meio)}
${xf(3, 3, 4, 2, meio)}
${xf(0, 3, 4, 2, meio)}
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

/** Monta o .xlsx. Separado do download para poder ser testado. */
export function montarXlsx<T>(dados: DadosPlanilha<T>): Uint8Array {
  const { colunas, linhas } = dados;
  const nCols = Math.max(colunas.length, 2);
  const ultimaLetra = letraColuna(nCols - 1);
  const textos = new Textos();
  const larguras = colunas.map((c) => Math.max(10, c.titulo.length + 2));
  const linhasXml: string[] = [];
  const merges: string[] = [];
  let r = 0;

  const celTexto = (ref: string, t: string, s: number) => `<c r="${ref}" s="${s}" t="s"><v>${textos.indice(t)}</v></c>`;
  const celNum = (ref: string, n: number, s: number) => `<c r="${ref}" s="${s}"><v>${n}</v></c>`;
  const linha = (cels: string[], ht?: number) => {
    r += 1;
    linhasXml.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ""}>${cels.join("")}</row>`);
  };

  // Título e período.
  linha([celTexto(`A1`, `Harmonize · ${dados.titulo}`, S.titulo), ...Array.from({ length: nCols - 1 }, (_, i) => `<c r="${letraColuna(i + 1)}1" s="${S.titulo}"/>`)], 30);
  merges.push(`A1:${ultimaLetra}1`);
  const sub = [dados.periodo, `${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"}`, `gerado em ${dataHoraBr(dados.geradoEm ?? new Date())}`]
    .filter(Boolean)
    .join(" · ");
  linha([celTexto(`A2`, sub, S.subtitulo)], 18);
  merges.push(`A2:${ultimaLetra}2`);

  // Resumo (rótulo na A, valor na B).
  if (dados.resumo?.length) {
    linha([]);
    for (const item of dados.resumo) {
      const n = r + 1;
      linha([
        celTexto(`A${n}`, item.rotulo, S.resumoRotulo),
        celNum(`B${n}`, Math.round(item.valor * 100) / 100, item.tipo === "inteiro" ? S.resumoInteiro : S.resumoMoeda),
      ]);
      larguras[0] = Math.max(larguras[0] ?? 10, item.rotulo.length + 2);
      if (larguras.length > 1) larguras[1] = Math.max(larguras[1], 16);
    }
  }
  linha([]);

  // Cabeçalho.
  const linhaCab = r + 1;
  linha(colunas.map((c, i) => celTexto(`${letraColuna(i)}${linhaCab}`, c.titulo, S.cabecalho)), 24);

  // Dados.
  const primeira = r + 1;
  const somas = colunas.map(() => 0);
  linhas.forEach((l, idx) => {
    const n = r + 1;
    const z = idx % 2;
    const cels: string[] = [];
    colunas.forEach((c, i) => {
      const ref = `${letraColuna(i)}${n}`;
      const bruto = c.valor(l);
      const tipo = c.tipo ?? "texto";
      if (bruto === null || bruto === undefined || bruto === "") {
        cels.push(`<c r="${ref}" s="${S[tipo === "texto" ? "texto" : tipo][z]}"/>`);
        return;
      }
      if ((tipo === "moeda" || tipo === "inteiro") && typeof bruto === "number" && Number.isFinite(bruto)) {
        const v = tipo === "moeda" ? Math.round(bruto * 100) / 100 : bruto;
        somas[i] += v;
        cels.push(celNum(ref, v, S[tipo][z]));
        larguras[i] = Math.max(larguras[i], tipo === "moeda" ? 14 : String(v).length + 3);
        return;
      }
      const texto = String(bruto);
      if (tipo === "data") {
        const serial = serialDeData(texto);
        if (serial !== null) {
          cels.push(celNum(ref, serial, S.data[z]));
          larguras[i] = Math.max(larguras[i], 12);
          return;
        }
      }
      cels.push(celTexto(ref, texto, S.texto[z]));
      larguras[i] = Math.max(larguras[i], Math.min(50, texto.length + 2));
    });
    linha(cels);
  });
  const ultima = r;

  // Total.
  if (colunas.some((c) => c.total) && linhas.length > 0) {
    const n = r + 1;
    linha(
      colunas.map((c, i) => {
        const ref = `${letraColuna(i)}${n}`;
        if (c.total) {
          const col = letraColuna(i);
          const s = c.tipo === "inteiro" ? S.totalInteiro : S.totalMoeda;
          const v = c.tipo === "moeda" ? Math.round(somas[i] * 100) / 100 : somas[i];
          return `<c r="${ref}" s="${s}"><f>SUM(${col}${primeira}:${col}${ultima})</f><v>${v}</v></c>`;
        }
        return i === 0 ? celTexto(ref, "Total", S.totalRotulo) : `<c r="${ref}" s="${S.totalVazio}"/>`;
      }),
      20
    );
  }

  const filtro = `A${linhaCab}:${letraColuna(colunas.length - 1)}${Math.max(ultima, linhaCab)}`;
  const cols = larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.min(54, w + 3)}" customWidth="1"/>`).join("");

  const planilha = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:${ultimaLetra}${r}"/>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="${linhaCab}" topLeftCell="A${linhaCab + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${linhaCab + 1}" sqref="A${linhaCab + 1}"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${linhasXml.join("")}</sheetData>
<autoFilter ref="${filtro}"/>
<mergeCells count="${merges.length}">${merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>
<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;

  const nomeAba = xml(dados.titulo.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Planilha");
  const livro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${nomeAba}" sheetId="1" r:id="rId1"/></sheets>
<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">'${nomeAba.replace(/'/g, "''")}'!${filtro.replace(/([A-Z]+)(\d+)/g, (_m, c, n) => `$${c}$${n}`)}</definedName></definedNames>
</workbook>`;

  const compartilhados = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.lista.length}" uniqueCount="${textos.lista.length}">${textos.lista
    .map((t) => `<si><t xml:space="preserve">${xml(t)}</t></si>`)
    .join("")}</sst>`;

  const arquivos: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(livro),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(planilha),
    "xl/styles.xml": strToU8(estilosXml()),
    "xl/sharedStrings.xml": strToU8(compartilhados),
  };
  return zipSync(arquivos, { level: 6 });
}
