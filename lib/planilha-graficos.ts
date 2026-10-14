// ============================================================
// GRÁFICOS DENTRO DA PLANILHA (.xlsx)
//
// Gráficos nativos do Office (DrawingML), que o Google Planilhas e o Excel
// abrem como gráficos de verdade, editáveis. Ficam numa aba "Gráficos",
// com os números de cada um numa tabelinha ao lado (o gráfico lê dela).
// Mesmas cores do Dashboard. Usado por lib/planilha-xlsx.ts.
// ============================================================

export type TipoGrafico = "colunas" | "barras" | "linha" | "area";

export interface SerieGrafico {
  nome: string;
  valores: number[];
  cor: string; // "#1F9E97"
}

export interface GraficoPlanilha {
  tipo: TipoGrafico;
  titulo: string;
  categorias: string[];
  series: SerieGrafico[];
  formato?: "moeda" | "inteiro";
}

export const COR_ENTRADA = "#1F9E97";
export const COR_SAIDA = "#D9577E";
export const COR_DESTAQUE = "#8B6BBF";

export const NOME_ABA_GRAFICOS = "Gráficos";

function xml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const hex = (c: string) => c.replace("#", "").toUpperCase();

function texto(sz: number, cor: string, negrito = false) {
  return `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}" b="${negrito ? 1 : 0}"><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>`;
}

export interface RefsGrafico {
  categorias: string; // 'Gráficos'!$J$5:$J$18
  series: { nome: string; valores: string }[];
}

function strCache(valores: string[]) {
  return `<c:strCache><c:ptCount val="${valores.length}"/>${valores.map((v, i) => `<c:pt idx="${i}"><c:v>${xml(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
}
function numCache(valores: number[], fmt: string) {
  return `<c:numCache><c:formatCode>${xml(fmt)}</c:formatCode><c:ptCount val="${valores.length}"/>${valores
    .map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`)
    .join("")}</c:numCache>`;
}

/** XML de um gráfico (xl/charts/chartN.xml). */
export function graficoXml(g: GraficoPlanilha, refs: RefsGrafico): string {
  const fmt = g.formato === "inteiro" ? "#,##0" : '"R$" #,##0';
  const horizontal = g.tipo === "barras";
  const mostraValores = horizontal;

  const series = g.series
    .map((s, i) => {
      const cor = hex(s.cor);
      let estilo: string;
      if (g.tipo === "linha") {
        estilo = `<c:spPr><a:ln w="34925" cap="rnd"><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>`;
      } else if (g.tipo === "area") {
        estilo = `<c:spPr><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:srgbClr val="${cor}"><a:alpha val="50000"/></a:srgbClr></a:gs><a:gs pos="100000"><a:srgbClr val="B8A0D0"><a:alpha val="6000"/></a:srgbClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:ln><a:noFill/></a:ln></c:spPr>`;
      } else {
        estilo = `<c:spPr><a:solidFill><a:srgbClr val="${cor}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr><c:invertIfNegative val="0"/>`;
      }
      const rotulos = mostraValores
        ? `<c:dLbls><c:numFmt formatCode="${xml(fmt)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${texto(
            900,
            "334155",
            true
          )}<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>`
        : "";
      return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${xml(refs.series[i].nome)}</c:f>${strCache([s.nome])}</c:strRef></c:tx>${estilo}${rotulos}<c:cat><c:strRef><c:f>${xml(
        refs.categorias
      )}</c:f>${strCache(g.categorias)}</c:strRef></c:cat><c:val><c:numRef><c:f>${xml(refs.series[i].valores)}</c:f>${numCache(s.valores, fmt)}</c:numRef></c:val>${
        g.tipo === "linha" ? '<c:smooth val="1"/>' : ""
      }</c:ser>`;
    })
    .join("");

  let corpo: string;
  if (g.tipo === "linha") {
    corpo = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:marker val="1"/><c:axId val="101"/><c:axId val="102"/></c:lineChart>`;
  } else if (g.tipo === "area") {
    // Área com degradê e, por cima, a linha da mesma série (sem contorno no fundo).
    const linhas = g.series
      .map((se, i) => {
        const k = g.series.length + i;
        return `<c:ser><c:idx val="${k}"/><c:order val="${k}"/><c:tx><c:strRef><c:f>${xml(refs.series[i].nome)}</c:f>${strCache([se.nome])}</c:strRef></c:tx><c:spPr><a:ln w="34925" cap="rnd"><a:solidFill><a:srgbClr val="${hex(
          se.cor
        )}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker><c:cat><c:strRef><c:f>${xml(refs.categorias)}</c:f>${strCache(
          g.categorias
        )}</c:strRef></c:cat><c:val><c:numRef><c:f>${xml(refs.series[i].valores)}</c:f>${numCache(se.valores, fmt)}</c:numRef></c:val><c:smooth val="0"/></c:ser>`;
      })
      .join("");
    corpo = `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${series}<c:axId val="101"/><c:axId val="102"/></c:areaChart><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${linhas}<c:marker val="1"/><c:axId val="101"/><c:axId val="102"/></c:lineChart>`;
  } else {
    corpo = `<c:barChart><c:barDir val="${horizontal ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${series}<c:gapWidth val="${
      horizontal ? 45 : 70
    }"/><c:overlap val="-12"/><c:axId val="101"/><c:axId val="102"/></c:barChart>`;
  }

  // Barras deitadas: maior em cima (categorias de cima para baixo).
  const eixoCat = `<c:catAx><c:axId val="101"/><c:scaling><c:orientation val="${horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${
    horizontal ? "l" : "b"
  }"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>${texto(
    900,
    "64748B"
  )}<c:crossAx val="102"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`;
  const eixoVal = `<c:valAx><c:axId val="102"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="${horizontal ? 1 : 0}"/><c:axPos val="${
    horizontal ? "b" : "l"
  }"/><c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="EEF2F6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xml(
    fmt
  )}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${texto(
    900,
    "94A3B8"
  )}<c:crossAx val="101"/><c:crosses val="${horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;

  const legenda =
    g.series.length > 1 ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${texto(1000, "475569")}</c:legend>` : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:roundedCorners val="1"/>
<c:chart>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill></a:defRPr></a:pPr><a:r><a:rPr lang="pt-BR" sz="1300" b="1"><a:solidFill><a:srgbClr val="1F2937"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xml(
    g.titulo
  )}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:autoTitleDeleted val="0"/>
<c:plotArea><c:layout/>${corpo}${eixoCat}${eixoVal}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr></c:plotArea>
${legenda}
<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/>
</c:chart>
<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>
</c:chartSpace>`;
}

/** Posição de cada gráfico na aba (âncora de células). */
export function desenhoXml(ancoras: { col0: number; lin0: number; col1: number; lin1: number }[]): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${ancoras
    .map(
      (a, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${a.col0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.lin0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${a.col1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${a.lin1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${
        i + 2
      }" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${
        i + 1
      }"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`
    )
    .join("")}</xdr:wsDr>`;
}
