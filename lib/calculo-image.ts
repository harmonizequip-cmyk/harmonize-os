import { roundedRectPath } from "./availability-image";
import type { ItemAjuste, ResumoLocacao } from "./rental-calculator";
import type { MentoriaPricingBreakdown, RentalPricingBreakdown } from "./rental-pricing";

// ============================================================
// IMAGEM DO CÁLCULO DOS DISPAROS
//
// Uma única imagem, na ordem em que a conta é feita (contagem, disparos,
// faixa aplicada, valor dos disparos, ajustes e total a cobrar), para mandar
// ao cliente conferir. Mesmo estilo da tela de cálculo: cartões claros, rosa
// para a faixa, azul-petróleo para o valor, degradê no total.
//
// A montagem dos números (montarDadosCalculo) é separada do desenho
// (drawCalculoImage) para poder ser testada sem canvas.
// ============================================================

export interface LinhaAjusteImagem {
  rotulo: string;
  valor: string;
  tom: "mais" | "menos" | "neutro";
}

export interface DadosImagemCalculo {
  /** "mentoria" não mostra contagens e troca os rótulos; o padrão é "disparos". */
  modo?: "disparos" | "mentoria";
  cliente: string | null;
  dataEvento: string | null; // YYYY-MM-DD
  contagemInicial: number;
  contagemFinal: number;
  disparos: number;
  faixaTitulo: string;
  faixaSubtitulo: string;
  faixaChip: string;
  faixaLinhas: string[];
  valorDisparos: number;
  ajustes: LinhaAjusteImagem[];
  total: number;
  observacaoTotal: string | null;
}

export function reais(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function inteiro(n: number): string {
  return n.toLocaleString("pt-BR");
}

function taxaPorDisparo(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/** Texto da faixa de preço aplicada e a conta que levou ao valor dos disparos. */
export function descreverFaixa(
  pricing: RentalPricingBreakdown,
  custoManualPorDisparo: number | null,
  disparos: number
): Pick<DadosImagemCalculo, "faixaTitulo" | "faixaSubtitulo" | "faixaChip" | "faixaLinhas" | "valorDisparos"> {
  if (custoManualPorDisparo != null) {
    const valor = Math.round(disparos * custoManualPorDisparo * 100) / 100;
    const linhas = [`${inteiro(disparos)} disparos x ${taxaPorDisparo(custoManualPorDisparo)} = ${reais(valor)}`];
    if (pricing.totalValue > valor) {
      linhas.push(`Tabela seria ${reais(pricing.totalValue)} (economia de ${reais(pricing.totalValue - valor)})`);
    }
    return {
      faixaTitulo: "CUSTO NEGOCIADO",
      faixaSubtitulo: "Valor por disparo combinado",
      faixaChip: taxaPorDisparo(custoManualPorDisparo),
      faixaLinhas: linhas,
      valorDisparos: valor,
    };
  }

  const cfg = pricing.config;
  const linhas: string[] = [
    `Pacote fixo (até ${inteiro(cfg.flatPackageLimit)} disparos): ${reais(pricing.flatPackageValue)}`,
  ];

  if (pricing.tier3Portion > 0) {
    linhas.push(`${inteiro(pricing.tier3Portion)} disparos x ${taxaPorDisparo(cfg.tier3Rate)} = ${reais(pricing.tier3Value)}`);
    return {
      faixaTitulo: "FAIXA 3 APLICADA",
      faixaSubtitulo: `Acima de ${inteiro(cfg.tier2Limit + 1)} disparos`,
      faixaChip: taxaPorDisparo(cfg.tier3Rate),
      faixaLinhas: linhas,
      valorDisparos: pricing.totalValue,
    };
  }
  if (pricing.tier2Portion > 0) {
    linhas.push(`${inteiro(pricing.tier2Portion)} disparos x ${taxaPorDisparo(cfg.tier2Rate)} = ${reais(pricing.tier2Value)}`);
    return {
      faixaTitulo: "FAIXA 2 APLICADA",
      faixaSubtitulo: `De ${inteiro(cfg.flatPackageLimit + 1)} a ${inteiro(cfg.tier2Limit)} disparos`,
      faixaChip: taxaPorDisparo(cfg.tier2Rate),
      faixaLinhas: linhas,
      valorDisparos: pricing.totalValue,
    };
  }
  return {
    faixaTitulo: "PACOTE FIXO",
    faixaSubtitulo: `Até ${inteiro(cfg.flatPackageLimit)} disparos`,
    faixaChip: reais(pricing.flatPackageValue),
    faixaLinhas: [`${inteiro(disparos)} disparos dentro do pacote: ${reais(pricing.flatPackageValue)}`],
    valorDisparos: pricing.totalValue,
  };
}

/** Linhas de "Ajustes finais": aluguel, desconto, deslocamento, itens livres e taxa. */
export function montarAjustes(params: {
  itens: ItemAjuste[];
  descontoPercentual: number | null;
  kmIda: number;
  resumo: ResumoLocacao;
}): LinhaAjusteImagem[] {
  const { itens, descontoPercentual, kmIda, resumo } = params;
  const linhas: LinhaAjusteImagem[] = [];

  for (const it of itens) {
    if (it.id === "aluguel") {
      linhas.push({ rotulo: "Aluguel do equipamento", valor: reais(it.valor), tom: "mais" });
    } else if (it.id === "desconto") {
      linhas.push({
        rotulo: "Desconto aplicado",
        valor: descontoPercentual != null ? `-${descontoPercentual}% = ${reais(it.valor)}` : `-${reais(it.valor)}`,
        tom: "menos",
      });
    } else {
      linhas.push({
        rotulo: it.desc,
        valor: it.tipo === "mais" ? reais(it.valor) : `-${reais(it.valor)}`,
        tom: it.tipo,
      });
    }
  }

  if (resumo.valorDeslocamento > 0) {
    linhas.push({
      rotulo: kmIda > 0 ? `Deslocamento (${inteiro(kmIda)} km de ida)` : "Deslocamento",
      valor: reais(resumo.valorDeslocamento),
      tom: "mais",
    });
  }
  if (resumo.creditoTaxa > 0) {
    linhas.push({ rotulo: "Taxa de reserva já paga (crédito)", valor: `-${reais(resumo.creditoTaxa)}`, tom: "menos" });
  }
  return linhas;
}

export function montarDadosCalculo(params: {
  cliente: string | null;
  dataEvento: string | null;
  contagemInicial: number;
  contagemFinal: number;
  disparos: number;
  pricing: RentalPricingBreakdown;
  custoManualPorDisparo: number | null;
  itens: ItemAjuste[];
  descontoPercentual: number | null;
  kmIda: number;
  resumo: ResumoLocacao;
}): DadosImagemCalculo {
  const faixa = descreverFaixa(params.pricing, params.custoManualPorDisparo, params.disparos);
  return {
    cliente: params.cliente,
    dataEvento: params.dataEvento,
    contagemInicial: params.contagemInicial,
    contagemFinal: params.contagemFinal,
    disparos: params.disparos,
    ...faixa,
    ajustes: montarAjustes({
      itens: params.itens,
      descontoPercentual: params.descontoPercentual,
      kmIda: params.kmIda,
      resumo: params.resumo,
    }),
    total: params.resumo.totalAPagarAgora,
    observacaoTotal:
      params.resumo.taxaACobrarAgora > 0
        ? `Inclui a taxa de reserva de ${reais(params.resumo.taxaACobrarAgora)}, paga agora como crédito`
        : null,
  };
}

/** Dados da imagem de uma mentoria: pacientes modelo x valor por paciente, mais os ajustes. */
export function montarDadosMentoria(params: {
  cliente: string | null;
  dataEvento: string | null;
  mentoria: MentoriaPricingBreakdown;
  itens: ItemAjuste[];
  descontoPercentual: number | null;
  kmIda: number;
  resumo: ResumoLocacao;
}): DadosImagemCalculo {
  const { mentoria } = params;
  return {
    modo: "mentoria",
    cliente: params.cliente,
    dataEvento: params.dataEvento,
    contagemInicial: 0,
    contagemFinal: 0,
    disparos: mentoria.patientCount,
    faixaTitulo: "VALOR POR PACIENTE",
    faixaSubtitulo: mentoria.isParcelado ? "Parcelado no crédito até 10x" : "À vista",
    faixaChip: reais(mentoria.unitValue),
    faixaLinhas: [
      `${inteiro(mentoria.patientCount)} paciente(s) x ${reais(mentoria.unitValue)} = ${reais(mentoria.totalValue)}`,
    ],
    valorDisparos: mentoria.totalValue,
    ajustes: montarAjustes({
      itens: params.itens,
      descontoPercentual: params.descontoPercentual,
      kmIda: params.kmIda,
      resumo: params.resumo,
    }),
    total: params.resumo.totalAPagarAgora,
    observacaoTotal:
      params.resumo.taxaACobrarAgora > 0
        ? `Inclui a taxa de reserva de ${reais(params.resumo.taxaACobrarAgora)}, paga agora como crédito`
        : null,
  };
}

// ------------------------------------------------------------
// Desenho
// ------------------------------------------------------------

const COR = {
  fundo: "#f4fbfb",
  tinta: "#1f2937",
  suave: "#6b7280",
  cinzaCard: "#f3f4f6",
  teal: "#2e9a94",
  tealClaro: "#e9f8f7",
  tealBorda: "#b9e6e3",
  rosa: "#e0679b",
  rosaClaro: "#fdf1f6",
  rosaBorda: "#f6c9dc",
  ouro: "#b8860b",
  ouroClaro: "#fffaea",
  ouroBorda: "#f1dd9b",
  branco: "#ffffff",
};
const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const LARGURA = 420;
const MARGEM = 20;
const ESCALA = 2;

function quebrar(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string[] {
  const palavras = texto.split(" ");
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width > larguraMax && atual) {
      linhas.push(atual);
      atual = p;
    } else {
      atual = teste;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function formatarData(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function drawCalculoImage(dados: DadosImagemCalculo): Promise<HTMLCanvasElement> {
  const medidor = document.createElement("canvas").getContext("2d") as CanvasRenderingContext2D;
  const larguraUtil = LARGURA - MARGEM * 2;

  // 1ª passada: mede a altura para o canvas já nascer do tamanho certo.
  medidor.font = `500 13px ${FONTE}`;
  const linhasFaixa = dados.faixaLinhas.flatMap((l) => quebrar(medidor, l, larguraUtil - 32));
  const alturaFaixa = 78 + linhasFaixa.length * 20;
  const alturaAjustes = dados.ajustes.length > 0 ? 40 + dados.ajustes.length * 52 : 0;
  const alturaObs = dados.observacaoTotal ? 24 : 0;
  const ehMentoria = dados.modo === "mentoria";
  const altura = 96 + (ehMentoria ? 60 : 3 * 60) + 70 + alturaFaixa + 20 + 90 + 20 + alturaAjustes + 130 + alturaObs + 56;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(ESCALA, ESCALA);

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);

  let y = 28;

  // Cabeçalho
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = COR.teal;
  ctx.font = `700 12px ${FONTE}`;
  ctx.fillText(ehMentoria ? "HARMONIZE  ·  CÁLCULO DA MENTORIA" : "HARMONIZE  ·  CÁLCULO DOS DISPAROS", MARGEM, y);
  y += 26;
  ctx.fillStyle = COR.tinta;
  ctx.font = `700 22px ${FONTE}`;
  ctx.fillText(dados.cliente ? dados.cliente.slice(0, 32) : "Cliente", MARGEM, y);
  y += 20;
  if (dados.dataEvento) {
    ctx.fillStyle = COR.suave;
    ctx.font = `500 13px ${FONTE}`;
    ctx.fillText(formatarData(dados.dataEvento), MARGEM, y);
  }
  y += 22;

  // Linha cinza com rótulo à esquerda e valor à direita.
  const linhaCinza = (rotulo: string, valor: string) => {
    roundedRectPath(ctx, MARGEM, y, larguraUtil, 48, 14);
    ctx.fillStyle = COR.cinzaCard;
    ctx.fill();
    ctx.fillStyle = COR.suave;
    ctx.font = `500 15px ${FONTE}`;
    ctx.textAlign = "left";
    ctx.fillText(rotulo, MARGEM + 16, y + 30);
    ctx.fillStyle = COR.tinta;
    ctx.font = `700 21px ${FONTE}`;
    ctx.textAlign = "right";
    ctx.fillText(valor, MARGEM + larguraUtil - 16, y + 31);
    ctx.textAlign = "left";
    y += 60;
  };
  if (!ehMentoria) {
    linhaCinza("Contagem inicial", inteiro(dados.contagemInicial));
    linhaCinza("Contagem final", inteiro(dados.contagemFinal));
  }

  // Disparos realizados
  roundedRectPath(ctx, MARGEM, y, larguraUtil, 56, 14);
  ctx.fillStyle = COR.tealClaro;
  ctx.fill();
  ctx.strokeStyle = COR.tealBorda;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = COR.tinta;
  ctx.font = `600 15px ${FONTE}`;
  ctx.fillText(ehMentoria ? "Pacientes modelo" : "Disparos realizados", MARGEM + 16, y + 34);
  ctx.fillStyle = COR.teal;
  ctx.font = `700 26px ${FONTE}`;
  ctx.textAlign = "right";
  ctx.fillText(inteiro(dados.disparos), MARGEM + larguraUtil - 16, y + 36);
  ctx.textAlign = "left";
  y += 74;

  // Faixa aplicada
  roundedRectPath(ctx, MARGEM, y, larguraUtil, alturaFaixa, 14);
  ctx.fillStyle = COR.rosaClaro;
  ctx.fill();
  ctx.strokeStyle = COR.rosaBorda;
  ctx.stroke();
  ctx.fillStyle = COR.rosa;
  ctx.font = `700 12px ${FONTE}`;
  ctx.fillText(dados.faixaTitulo.split("").join(" ").replace(/ {2,}/g, "  "), MARGEM + 16, y + 26);
  ctx.fillStyle = COR.suave;
  ctx.font = `500 14px ${FONTE}`;
  ctx.fillText(dados.faixaSubtitulo, MARGEM + 16, y + 46);
  // chip da taxa
  ctx.font = `700 15px ${FONTE}`;
  const larguraChip = ctx.measureText(dados.faixaChip).width + 24;
  roundedRectPath(ctx, MARGEM + larguraUtil - 16 - larguraChip, y + 14, larguraChip, 32, 10);
  ctx.fillStyle = "#fbe0ec";
  ctx.fill();
  ctx.strokeStyle = COR.rosaBorda;
  ctx.stroke();
  ctx.fillStyle = COR.rosa;
  ctx.textAlign = "center";
  ctx.fillText(dados.faixaChip, MARGEM + larguraUtil - 16 - larguraChip / 2, y + 36);
  ctx.textAlign = "left";
  // pontilhado + linhas da conta
  ctx.strokeStyle = COR.rosaBorda;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(MARGEM + 16, y + 60);
  ctx.lineTo(MARGEM + larguraUtil - 16, y + 60);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COR.tinta;
  ctx.font = `500 13px ${FONTE}`;
  linhasFaixa.forEach((l, i) => ctx.fillText(l, MARGEM + 16, y + 82 + i * 20));
  y += alturaFaixa + 18;

  // Valor dos disparos
  roundedRectPath(ctx, MARGEM, y, larguraUtil, 92, 16);
  ctx.fillStyle = COR.tealClaro;
  ctx.fill();
  ctx.strokeStyle = COR.tealBorda;
  ctx.stroke();
  ctx.fillStyle = COR.teal;
  ctx.font = `700 12px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText(ehMentoria ? "V A L O R   D A   M E N T O R I A" : "V A L O R   D O S   D I S P A R O S", LARGURA / 2, y + 28);
  ctx.font = `700 34px ${FONTE}`;
  ctx.fillText(reais(dados.valorDisparos), LARGURA / 2, y + 66);
  ctx.textAlign = "left";
  y += 92 + 22;

  // Ajustes finais
  if (dados.ajustes.length > 0) {
    ctx.fillStyle = COR.teal;
    ctx.font = `700 12px ${FONTE}`;
    ctx.fillText("A J U S T E S   F I N A I S", MARGEM, y + 6);
    y += 20;
    for (const a of dados.ajustes) {
      const [fundo, borda, texto] =
        a.tom === "menos"
          ? [COR.rosaClaro, COR.rosaBorda, COR.rosa]
          : a.tom === "mais"
            ? [COR.ouroClaro, COR.ouroBorda, COR.ouro]
            : [COR.cinzaCard, "#e5e7eb", COR.tinta];
      roundedRectPath(ctx, MARGEM, y, larguraUtil, 42, 12);
      ctx.fillStyle = fundo;
      ctx.fill();
      ctx.strokeStyle = borda;
      ctx.stroke();
      ctx.fillStyle = texto;
      ctx.font = `600 14px ${FONTE}`;
      ctx.textAlign = "left";
      const sinal = a.tom === "mais" ? "+ " : a.tom === "menos" ? "- " : "";
      ctx.fillText(`${sinal}${a.rotulo}`.slice(0, 30), MARGEM + 14, y + 26);
      ctx.font = `700 14px ${FONTE}`;
      ctx.textAlign = "right";
      ctx.fillText(a.valor, MARGEM + larguraUtil - 14, y + 26);
      ctx.textAlign = "left";
      y += 52;
    }
    y += 4;
  }

  // Total a cobrar, com o degradê da marca
  const alturaTotal = 104;
  roundedRectPath(ctx, MARGEM, y, larguraUtil, alturaTotal, 18);
  ctx.fillStyle = "#fbf3f7";
  ctx.fill();
  ctx.strokeStyle = COR.tealBorda;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.fillStyle = COR.teal;
  ctx.font = `700 12px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText("T O T A L   A   C O B R A R   D O   C L I E N T E", LARGURA / 2, y + 30);
  const texto = reais(dados.total);
  ctx.font = `800 40px ${FONTE}`;
  const larguraTexto = ctx.measureText(texto).width;
  const grad = ctx.createLinearGradient(LARGURA / 2 - larguraTexto / 2, 0, LARGURA / 2 + larguraTexto / 2, 0);
  grad.addColorStop(0, "#3DBFB8");
  grad.addColorStop(0.55, "#7EC8E3");
  grad.addColorStop(1, "#B8A0D0");
  ctx.fillStyle = grad;
  ctx.fillText(texto, LARGURA / 2, y + 76);
  ctx.textAlign = "left";
  y += alturaTotal;

  if (dados.observacaoTotal) {
    ctx.fillStyle = COR.suave;
    ctx.font = `500 12px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText(dados.observacaoTotal, LARGURA / 2, y + 20);
    ctx.textAlign = "left";
    y += 24;
  }

  ctx.fillStyle = COR.suave;
  ctx.font = `500 11px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText("Harmonize  ·  conferência do cálculo, sujeita a confirmação", LARGURA / 2, y + 34);

  // A altura da primeira passada é só uma estimativa folgada: recorta no
  // ponto exato em que o desenho terminou, para a imagem não ter vazio no fim.
  const alturaFinal = Math.ceil(y + 50);
  const saida = document.createElement("canvas");
  saida.width = LARGURA * ESCALA;
  saida.height = alturaFinal * ESCALA;
  (saida.getContext("2d") as CanvasRenderingContext2D).drawImage(
    canvas,
    0,
    0,
    canvas.width,
    alturaFinal * ESCALA,
    0,
    0,
    saida.width,
    saida.height
  );
  return saida;
}
