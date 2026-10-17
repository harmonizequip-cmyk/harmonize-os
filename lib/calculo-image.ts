import { roundedRectPath } from "./availability-image";
import type { ItemAjuste, ResumoLocacao } from "./rental-calculator";
import type { MentoriaPricingBreakdown, RentalPricingBreakdown } from "./rental-pricing";

// ============================================================
// IMAGEM DO CÁLCULO DOS DISPAROS
//
// Uma imagem para mandar ao cliente conferir. O total a pagar fica no topo,
// num destaque com o degradê da marca (o WhatsApp corta a prévia de imagem
// alta pela parte de baixo); embaixo, o detalhe em formato de recibo
// (contagens, faixa, ajustes) e, quando há, o crédito que fica para a próxima.
//
// A montagem dos números (montarDadosCalculo, linhasRecibo) é separada do
// desenho (drawCalculoImage) para poder ser testada sem canvas.
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
  /** Mais de uma contagem (troca de ponteira): cada uma vira uma linha. */
  contagens?: ContagemImagem[];
  /** Total real de disparos quando parte foi coberta pelo crédito (`disparos` = cobrados). */
  disparosRealizados?: number;
  /** Disparos do crédito da cliente usados nesta locação. */
  creditoUsado?: number;
}

export interface ContagemImagem {
  inicial: number;
  final: number;
  disparos: number;
  viraCredito: boolean;
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
    return {
      faixaTitulo: "FAIXA 3 APLICADA",
      faixaSubtitulo: `Acima de ${inteiro(cfg.tier2Limit)} disparos, sobre o total`,
      faixaChip: taxaPorDisparo(cfg.tier3Rate),
      faixaLinhas: [`${inteiro(pricing.tier3Portion)} disparos x ${taxaPorDisparo(cfg.tier3Rate)} = ${reais(pricing.tier3Value)}`],
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

/** Todos os disparos cobertos pelo crédito: não há faixa, o valor é zero. */
export function faixaTudoNoCredito(
  disparosDoCredito: number
): Pick<DadosImagemCalculo, "faixaTitulo" | "faixaSubtitulo" | "faixaChip" | "faixaLinhas" | "valorDisparos"> {
  return {
    faixaTitulo: "CRÉDITO DA CLIENTE",
    faixaSubtitulo: "Todos os disparos cobertos pelo crédito",
    faixaChip: reais(0),
    faixaLinhas: [`${inteiro(disparosDoCredito)} disparos do crédito: ${reais(0)}`],
    valorDisparos: 0,
  };
}

export function montarDadosCalculo(params: {
  cliente: string | null;
  dataEvento: string | null;
  contagemInicial: number;
  contagemFinal: number;
  /** Disparos cobrados (depois do crédito usado). */
  disparos: number;
  /** null quando todos os disparos foram cobertos pelo crédito. */
  pricing: RentalPricingBreakdown | null;
  custoManualPorDisparo: number | null;
  itens: ItemAjuste[];
  descontoPercentual: number | null;
  kmIda: number;
  resumo: ResumoLocacao;
  /** Contagens da locação; só aparecem na imagem quando são mais de uma. */
  contagens?: ContagemImagem[];
  disparosRealizados?: number;
  creditoUsado?: number;
}): DadosImagemCalculo {
  const creditoUsado = Math.max(0, Math.round(params.creditoUsado ?? 0));
  const faixa =
    params.pricing && params.disparos > 0
      ? descreverFaixa(params.pricing, params.custoManualPorDisparo, params.disparos)
      : faixaTudoNoCredito(creditoUsado || params.disparosRealizados || 0);
  const extras: Pick<DadosImagemCalculo, "contagens" | "disparosRealizados" | "creditoUsado"> = {};
  if (params.contagens && params.contagens.length > 1) extras.contagens = params.contagens;
  if (creditoUsado > 0) {
    extras.creditoUsado = creditoUsado;
    extras.disparosRealizados = params.disparosRealizados ?? params.disparos + creditoUsado;
  }
  return {
    ...extras,
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
// Recibo (pura, testável): o que vai na imagem, na ordem.
// ------------------------------------------------------------

export interface LinhaRecibo {
  tipo: "secao" | "linha" | "subtotal" | "total";
  rotulo: string;
  detalhe?: string;
  valor?: string;
  tom?: "mais" | "menos" | "credito" | "neutro";
}

/** Separa "Pacote fixo (...): R$ 2.500,00" e "4.394 disparos x R$ 0,10 = R$ 439,40" em rótulo e valor. */
export function separarLinhaFaixa(l: string): { rotulo: string; valor?: string } {
  const igual = l.lastIndexOf(" = ");
  if (igual > 0) return { rotulo: l.slice(0, igual), valor: l.slice(igual + 3) };
  const dois = l.lastIndexOf(": ");
  if (dois > 0) return { rotulo: l.slice(0, dois), valor: l.slice(dois + 2) };
  return { rotulo: l };
}

/** Disparos que viram crédito nesta locação (contagens marcadas). */
export function disparosQueViramCredito(d: DadosImagemCalculo): number {
  return (d.contagens ?? []).filter((c) => c.viraCredito).reduce((s, c) => s + c.disparos, 0);
}

export function linhasRecibo(d: DadosImagemCalculo): LinhaRecibo[] {
  const ehMentoria = d.modo === "mentoria";
  const out: LinhaRecibo[] = [];
  if (ehMentoria) {
    out.push({ tipo: "secao", rotulo: "Mentoria" });
    out.push({ tipo: "linha", rotulo: "Pacientes modelo", valor: inteiro(d.disparos) });
  } else {
    out.push({ tipo: "secao", rotulo: "Contagem do aparelho" });
    const contagens = d.contagens && d.contagens.length > 1 ? d.contagens : null;
    if (contagens) {
      contagens.forEach((c, i) =>
        out.push({
          tipo: "linha",
          rotulo: `Contagem ${i + 1}${c.viraCredito ? " · vira crédito" : ""}`,
          detalhe: `${inteiro(c.inicial)} → ${inteiro(c.final)}`,
          valor: inteiro(c.disparos),
          tom: c.viraCredito ? "credito" : "neutro",
        })
      );
    } else {
      out.push({ tipo: "linha", rotulo: "Contagem", detalhe: `${inteiro(d.contagemInicial)} → ${inteiro(d.contagemFinal)}`, valor: inteiro(d.disparos + (d.creditoUsado ?? 0)) });
    }
    const realizados = (d.creditoUsado ?? 0) > 0 ? d.disparosRealizados ?? d.disparos : d.disparos;
    out.push({ tipo: "subtotal", rotulo: "Disparos realizados", valor: inteiro(realizados) });
    if ((d.creditoUsado ?? 0) > 0) {
      out.push({ tipo: "linha", rotulo: "Crédito usado", valor: `−${inteiro(d.creditoUsado ?? 0)}`, tom: "credito" });
      out.push({ tipo: "linha", rotulo: "Disparos cobrados", valor: inteiro(d.disparos) });
    }
  }
  out.push({ tipo: "secao", rotulo: ehMentoria ? "Valor" : `${d.faixaTitulo.charAt(0)}${d.faixaTitulo.slice(1).toLowerCase()} · ${d.faixaChip}` });
  for (const l of d.faixaLinhas) {
    const { rotulo, valor } = separarLinhaFaixa(l);
    out.push({ tipo: "linha", rotulo, valor });
  }
  out.push({ tipo: "subtotal", rotulo: ehMentoria ? "Valor da mentoria" : "Valor dos disparos", valor: reais(d.valorDisparos) });
  if (d.ajustes.length) {
    out.push({ tipo: "secao", rotulo: "Ajustes" });
    for (const a of d.ajustes) out.push({ tipo: "linha", rotulo: a.rotulo, valor: a.valor, tom: a.tom });
  }
  out.push({ tipo: "total", rotulo: "Total a pagar", valor: reais(d.total) });
  return out;
}

// ------------------------------------------------------------
// Desenho: o total vem no topo (o WhatsApp corta a prévia da imagem pela
// parte de baixo) e o detalhe segue em formato de recibo, compacto.
// ------------------------------------------------------------

const COR = {
  fundo: "#F3F8F8",
  cartao: "#FFFFFF",
  tinta: "#17202A",
  suave: "#6B7480",
  linha: "#E6ECEE",
  teal: "#1F8F88",
  tealClaro: "#E8F7F6",
  rosa: "#D65A8A",
  rosaClaro: "#FDF0F5",
  ouro: "#A87808",
};
const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const LARGURA = 440;
const MARGEM = 18;
const ESCALA = 2.5;

function formatarData(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function cortar(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string {
  if (ctx.measureText(texto).width <= larguraMax) return texto;
  let t = texto;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > larguraMax) t = t.slice(0, -1);
  return `${t}…`;
}

export async function drawCalculoImage(dados: DadosImagemCalculo): Promise<HTMLCanvasElement> {
  const ehMentoria = dados.modo === "mentoria";
  const linhas = linhasRecibo(dados).filter((l) => l.tipo !== "total");
  const credito = ehMentoria ? 0 : disparosQueViramCredito(dados);
  const larguraUtil = LARGURA - MARGEM * 2;

  // Altura: cabeçalho + destaque + recibo + crédito + rodapé.
  const altLinha = (l: LinhaRecibo) => (l.tipo === "secao" ? 30 : l.detalhe ? 40 : 30);
  const altRecibo = 24 + linhas.reduce((s, l) => s + altLinha(l), 0) + 16;
  const altCredito = credito > 0 ? 74 : 0;
  const altObs = dados.observacaoTotal ? 20 : 0;
  const altura = 78 + 168 + altObs + 14 + altRecibo + (altCredito ? altCredito + 12 : 0) + 40;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(LARGURA * ESCALA);
  canvas.height = Math.round(altura * ESCALA);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);
  // faixa da marca no topo
  const faixa = ctx.createLinearGradient(0, 0, LARGURA, 0);
  faixa.addColorStop(0, "#3DBFB8");
  faixa.addColorStop(0.55, "#7EC8E3");
  faixa.addColorStop(1, "#B8A0D0");
  ctx.fillStyle = faixa;
  ctx.fillRect(0, 0, LARGURA, 5);

  // Cabeçalho: cliente e data
  let y = 30;
  ctx.textAlign = "left";
  ctx.fillStyle = COR.teal;
  ctx.font = `800 10.5px ${FONTE}`;
  ctx.fillText(ehMentoria ? "HARMONIZE  ·  CÁLCULO DA MENTORIA" : "HARMONIZE  ·  CÁLCULO DOS DISPAROS", MARGEM, y);
  if (dados.dataEvento) {
    ctx.textAlign = "right";
    ctx.fillStyle = COR.suave;
    ctx.font = `600 11px ${FONTE}`;
    ctx.fillText(formatarData(dados.dataEvento), LARGURA - MARGEM, y);
    ctx.textAlign = "left";
  }
  y += 28;
  ctx.fillStyle = COR.tinta;
  ctx.font = `800 21px ${FONTE}`;
  ctx.fillText(cortar(ctx, (dados.cliente ?? "Cliente").toUpperCase(), larguraUtil), MARGEM, y);
  y += 20;

  // Destaque: total a pagar (o que precisa aparecer na prévia do WhatsApp)
  const altDestaque = 168;
  roundedRectPath(ctx, MARGEM, y, larguraUtil, altDestaque, 22);
  const grad = ctx.createLinearGradient(MARGEM, y, MARGEM + larguraUtil, y + altDestaque);
  grad.addColorStop(0, "#2FB3AC");
  grad.addColorStop(0.6, "#6FBFDC");
  grad.addColorStop(1, "#A995CF");
  ctx.fillStyle = grad;
  ctx.fill();
  // brilho
  ctx.save();
  roundedRectPath(ctx, MARGEM, y, larguraUtil, altDestaque, 22);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(MARGEM + larguraUtil - 30, y + 10, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `800 11px ${FONTE}`;
  ctx.fillText("T O T A L   A   P A G A R", MARGEM + 22, y + 34);
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `900 44px ${FONTE}`;
  ctx.fillText(reais(dados.total), MARGEM + 20, y + 84);

  // pílulas: disparos e faixa
  const pilulas: string[] = [];
  if (ehMentoria) pilulas.push(`${inteiro(dados.disparos)} paciente(s)`);
  else pilulas.push(`${inteiro((dados.creditoUsado ?? 0) > 0 ? dados.disparosRealizados ?? dados.disparos : dados.disparos)} disparos`);
  pilulas.push(ehMentoria ? `${dados.faixaChip} por paciente` : `${dados.faixaTitulo.replace(" APLICADA", "").charAt(0)}${dados.faixaTitulo.replace(" APLICADA", "").slice(1).toLowerCase()} · ${dados.faixaChip}`);
  if (credito > 0) pilulas.push(`+${inteiro(credito)} de crédito`);
  let px = MARGEM + 22;
  const py = y + 108;
  ctx.font = `700 12px ${FONTE}`;
  for (const t of pilulas) {
    const w = ctx.measureText(t).width + 22;
    if (px + w > MARGEM + larguraUtil - 16) break;
    roundedRectPath(ctx, px, py, w, 26, 13);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(t, px + 11, py + 17.5);
    px += w + 8;
  }
  y += altDestaque;

  if (dados.observacaoTotal) {
    ctx.fillStyle = COR.suave;
    ctx.font = `500 11px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText(cortar(ctx, dados.observacaoTotal, larguraUtil), LARGURA / 2, y + 16);
    ctx.textAlign = "left";
    y += altObs;
  }
  y += 14;

  // Recibo: como chegamos no valor
  roundedRectPath(ctx, MARGEM, y, larguraUtil, altRecibo, 18);
  ctx.fillStyle = COR.cartao;
  ctx.fill();
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1;
  ctx.stroke();
  let ry = y + 14;
  const xi = MARGEM + 18;
  const xf = MARGEM + larguraUtil - 18;
  for (const l of linhas) {
    if (l.tipo === "secao") {
      ctx.fillStyle = COR.teal;
      ctx.font = `800 10.5px ${FONTE}`;
      ctx.textAlign = "left";
      ctx.fillText(l.rotulo.toUpperCase(), xi, ry + 22);
      ry += 30;
      continue;
    }
    const alt = altLinha(l);
    const base = l.detalhe ? ry + 18 : ry + 20;
    if (l.tipo === "subtotal") {
      ctx.strokeStyle = COR.linha;
      ctx.beginPath();
      ctx.moveTo(xi, ry + 2);
      ctx.lineTo(xf, ry + 2);
      ctx.stroke();
    }
    const corValor = l.tom === "credito" ? COR.rosa : l.tom === "menos" ? COR.rosa : l.tom === "mais" ? COR.ouro : COR.tinta;
    ctx.textAlign = "right";
    ctx.font = l.tipo === "subtotal" ? `800 15px ${FONTE}` : `700 13.5px ${FONTE}`;
    ctx.fillStyle = l.tipo === "subtotal" ? COR.teal : corValor;
    const valor = l.valor ?? "";
    ctx.fillText(valor, xf, base);
    const larguraValor = ctx.measureText(valor).width;
    ctx.textAlign = "left";
    ctx.font = l.tipo === "subtotal" ? `700 13.5px ${FONTE}` : `500 13px ${FONTE}`;
    ctx.fillStyle = l.tom === "credito" ? COR.rosa : l.tipo === "subtotal" ? COR.tinta : "#3A4552";
    ctx.fillText(cortar(ctx, l.rotulo, xf - xi - larguraValor - 12), xi, base);
    if (l.detalhe) {
      ctx.fillStyle = COR.suave;
      ctx.font = `500 11px ${FONTE}`;
      ctx.fillText(l.detalhe, xi, base + 15);
    }
    ry += alt;
  }
  y += altRecibo;

  // Crédito: explica o que é a contagem que "vira crédito"
  if (credito > 0) {
    y += 12;
    roundedRectPath(ctx, MARGEM, y, larguraUtil, altCredito, 18);
    ctx.fillStyle = COR.rosaClaro;
    ctx.fill();
    ctx.strokeStyle = "#F4C6D8";
    ctx.stroke();
    ctx.fillStyle = COR.rosa;
    ctx.font = `800 10.5px ${FONTE}`;
    ctx.textAlign = "left";
    ctx.fillText("CRÉDITO PARA O PRÓXIMO ATENDIMENTO", MARGEM + 18, y + 24);
    ctx.font = `800 20px ${FONTE}`;
    ctx.fillText(`${inteiro(credito)} disparos`, MARGEM + 18, y + 50);
    ctx.fillStyle = COR.suave;
    ctx.font = `500 11px ${FONTE}`;
    ctx.fillText("Pagos hoje e guardados para usar na próxima locação.", MARGEM + 18, y + 66);
    y += altCredito;
  }

  ctx.fillStyle = COR.suave;
  ctx.font = `500 10.5px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText("Harmonize  ·  conferência do cálculo, sujeita a confirmação", LARGURA / 2, y + 26);

  const alturaFinal = Math.ceil(y + 40);
  const saida = document.createElement("canvas");
  saida.width = Math.round(LARGURA * ESCALA);
  saida.height = Math.round(alturaFinal * ESCALA);
  (saida.getContext("2d") as CanvasRenderingContext2D).drawImage(canvas, 0, 0, canvas.width, saida.height, 0, 0, saida.width, saida.height);
  return saida;
}
