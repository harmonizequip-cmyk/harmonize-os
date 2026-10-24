import { roundedRectPath } from "./availability-image";
import type { PricingConfig } from "./rental-pricing";
import { DEFAULT_PREFERENCIAS, type EstimativaDisparos, type Preferencias } from "./preferencias";

// ============================================================
// ARTE DA TABELA DE PREÇOS DO HIPRO (layout da Harmonize)
//
// Os valores saem de Configurações (PricingConfig e taxa de reserva):
// mudou o preço lá, a arte já sai com o novo. As estimativas de disparos
// por procedimento, a linha em destaque, as "Informações importantes" e a
// nota vêm de Configurações > Tabela de preços (padrão = a tabela que o dono
// usava).
// ============================================================

const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const COR = {
  fundo: "#F6FAFA",
  texto: "#1F2937",
  cinza: "#6B7280",
  linha: "#E5E7EB",
  teal: "#3DBFB8",
  tealEscuro: "#1F7A75",
  pink: "#E8789A",
  pinkEscuro: "#C9557A",
  azul: "#7EC8E3",
  lilas: "#B8A0D0",
  lilasEscuro: "#7E62A8",
};

/** Padrão das estimativas (as 6 da grade e, por último, a linha em destaque). */
export const ESTIMATIVAS_DISPAROS: EstimativaDisparos[] = [
  ...DEFAULT_PREFERENCIAS.tabelaPrecos.estimativas,
  DEFAULT_PREFERENCIAS.tabelaPrecos.destaque,
];

/** O que entra no quadro de estimativas: até 6 itens na grade e o destaque (ou nenhum). */
export function estimativasDaArte(tp: Preferencias["tabelaPrecos"] = DEFAULT_PREFERENCIAS.tabelaPrecos): {
  itens: EstimativaDisparos[];
  destaque: EstimativaDisparos | null;
} {
  return {
    itens: tp.estimativas.slice(0, 6),
    destaque: tp.destaque.procedimento.trim() && tp.destaque.disparos > 0 ? tp.destaque : null,
  };
}

export const LARGURA_TABELA = 1080;
// Altura máxima do rascunho; a arte é recortada na altura que ocupou.
const ALTURA_RASCUNHO = 2600;

const milhar = (n: number) => n.toLocaleString("pt-BR");
/** R$ 2.500,00 / R$ 0,10 / R$ 0,065 */
export function reaisTabela(n: number): string {
  const casas = Math.abs(Math.round(n * 100) - n * 100) < 1e-6 ? 2 : 3;
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

function gradiente(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, COR.teal);
  g.addColorStop(0.55, COR.azul);
  g.addColorStop(1, COR.lilas);
  return g;
}

function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  let atual = "";
  for (const p of texto.split(/\s+/).filter(Boolean)) {
    const teste = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(teste).width <= largura || !atual) atual = teste;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

function cartao(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = "rgba(31, 122, 117, 0.10)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  roundedRectPath(ctx, x, y, w, h, 28);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.restore();
}

function check(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = COR.teal;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.45, cy + r * 0.02);
  ctx.lineTo(cx - r * 0.1, cy + r * 0.38);
  ctx.lineTo(cx + r * 0.48, cy - r * 0.32);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

function tituloSecao(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number) {
  ctx.fillStyle = COR.tealEscuro;
  ctx.font = `800 30px ${FONTE}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(texto.toUpperCase(), x, y);
}

export function drawTabelaPrecos(
  cfg: PricingConfig,
  taxaReserva: number,
  logo: HTMLImageElement | null,
  tabela: Preferencias["tabelaPrecos"] = DEFAULT_PREFERENCIAS.tabelaPrecos,
): HTMLCanvasElement {
  const W = LARGURA_TABELA;
  const H = ALTURA_RASCUNHO;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const M = 60; // margem
  const CW = W - M * 2;

  // Fundo com manchas suaves nas cores da marca.
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);
  const mancha = (x: number, y: number, r: number, cor: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, cor);
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  mancha(980, 120, 420, "rgba(126, 200, 227, 0.28)");
  mancha(60, 380, 380, "rgba(232, 120, 154, 0.14)");
  mancha(1000, 1500, 460, "rgba(184, 160, 208, 0.18)");

  // Logo e título.
  let y = 56;
  if (logo && logo.width > 0) {
    const lw = 440;
    const lh = (logo.height / logo.width) * lw;
    ctx.drawImage(logo, (W - lw) / 2, y, lw, lh);
    y += lh + 40;
  } else {
    ctx.fillStyle = COR.texto;
    ctx.font = `italic 700 72px ${FONTE}`;
    ctx.textAlign = "center";
    ctx.fillText("Harmonize", W / 2, y + 70);
    y += 120;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 62px ${FONTE}`;
  const t1 = "Tabela de preços ";
  const t2 = "HIPRO";
  const w1 = ctx.measureText(t1).width;
  const w2 = ctx.measureText(t2).width;
  const x0 = (W - w1 - w2) / 2;
  ctx.textAlign = "left";
  ctx.fillStyle = COR.texto;
  ctx.fillText(t1, x0, y + 50);
  ctx.fillStyle = gradiente(ctx, x0 + w1, y, w2, 60);
  ctx.fillText(t2, x0 + w1, y + 50);
  ctx.textAlign = "center";
  ctx.fillStyle = COR.cinza;
  ctx.font = `500 28px ${FONTE}`;
  ctx.fillText("Simples e transparente: você paga pelo que usar.", W / 2, y + 100);
  y += 150;

  // Faixas de preço.
  const faixas = [
    {
      cor: COR.teal,
      corTexto: COR.tealEscuro,
      rotulo: `Até ${milhar(cfg.flatPackageLimit)} disparos`,
      preco: reaisTabela(cfg.flatPackageValue),
      detalhe: `Pacote fixo. Valor único para até ${milhar(cfg.flatPackageLimit)} disparos.`,
    },
    {
      cor: COR.pink,
      corTexto: COR.pinkEscuro,
      rotulo: `De ${milhar(cfg.flatPackageLimit + 1)} a ${milhar(cfg.tier2Limit)} disparos`,
      preco: `${reaisTabela(cfg.flatPackageValue)} + ${reaisTabela(cfg.tier2Rate)}`,
      detalhe: `por disparo que passar de ${milhar(cfg.flatPackageLimit)}.`,
    },
    {
      cor: COR.lilas,
      corTexto: COR.lilasEscuro,
      rotulo: `Acima de ${milhar(cfg.tier2Limit)} disparos`,
      preco: reaisTabela(cfg.tier3Rate),
      detalhe: "por disparo, sobre o total de disparos.",
    },
  ];
  const hFaixa = 196;
  for (const f of faixas) {
    cartao(ctx, M, y, CW, hFaixa);
    ctx.save();
    roundedRectPath(ctx, M, y, CW, hFaixa, 28);
    ctx.clip();
    ctx.fillStyle = f.cor;
    ctx.fillRect(M, y, 14, hFaixa);
    ctx.restore();
    ctx.textAlign = "left";
    ctx.fillStyle = f.corTexto;
    ctx.font = `800 28px ${FONTE}`;
    ctx.fillText(f.rotulo.toUpperCase(), M + 48, y + 54);
    ctx.fillStyle = COR.texto;
    let tam = 64;
    ctx.font = `800 ${tam}px ${FONTE}`;
    while (ctx.measureText(f.preco).width > CW - 96 && tam > 36) {
      tam -= 4;
      ctx.font = `800 ${tam}px ${FONTE}`;
    }
    ctx.fillText(f.preco, M + 48, y + 126);
    ctx.fillStyle = COR.cinza;
    ctx.font = `500 27px ${FONTE}`;
    ctx.fillText(f.detalhe, M + 48, y + 168);
    y += hFaixa + 22;
  }

  // Reserva de agenda (faixa com o degradê da marca).
  y += 8;
  const hRes = 170;
  ctx.save();
  ctx.shadowColor = "rgba(61, 191, 184, 0.35)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  roundedRectPath(ctx, M, y, CW, hRes, 28);
  ctx.fillStyle = gradiente(ctx, M, y, CW, hRes);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = `800 28px ${FONTE}`;
  ctx.fillText("RESERVA DE AGENDA", M + 48, y + 56);
  ctx.font = `800 62px ${FONTE}`;
  ctx.fillText(reaisTabela(taxaReserva), M + 48, y + 128);
  ctx.textAlign = "right";
  ctx.font = `700 28px ${FONTE}`;
  ctx.fillText("Vira crédito na locação.", W - M - 44, y + 78);
  ctx.font = `500 25px ${FONTE}`;
  ctx.fillText("Não é taxa adicional.", W - M - 44, y + 116);
  y += hRes + 30;

  // Informações importantes.
  const infos = tabela.infos;
  if (infos.length > 0) {
    const hInfo = 92 + infos.length * 50;
    cartao(ctx, M, y, CW, hInfo);
    tituloSecao(ctx, "Informações importantes", M + 48, y + 62);
    infos.forEach((t, i) => {
      const cy = y + 112 + i * 50;
      check(ctx, M + 64, cy - 9, 15);
      ctx.fillStyle = COR.texto;
      ctx.textAlign = "left";
      ctx.font = `500 27px ${FONTE}`;
      ctx.fillText(t, M + 96, cy, CW - 96 - 48);
    });
    y += hInfo + 30;
  }

  // Estimativa de disparos por procedimento.
  const { itens, destaque: combo } = estimativasDaArte(tabela);
  const linhas = Math.ceil(itens.length / 2);
  ctx.font = `italic 400 22px ${FONTE}`;
  const linhasNota = tabela.nota ? quebrar(ctx, tabela.nota, CW - 96) : [];
  // Mesma altura de sempre com destaque e nota de uma linha; sem eles, o quadro encolhe.
  const hEst = 100 + linhas * 62 + (combo ? 96 : 0) + (linhasNota.length ? 24 + linhasNota.length * 28 : 0) + (combo || linhasNota.length ? 0 : 10);
  cartao(ctx, M, y, CW, hEst);
  tituloSecao(ctx, "Estimativa de disparos por procedimento", M + 48, y + 62);
  const colW = (CW - 96 - 40) / 2;
  itens.forEach((it, i) => {
    const col = i % 2;
    const lin = Math.floor(i / 2);
    const x = M + 48 + col * (colW + 40);
    const yy = y + 122 + lin * 62;
    ctx.textAlign = "left";
    ctx.fillStyle = COR.texto;
    ctx.font = `600 27px ${FONTE}`;
    ctx.fillText(it.procedimento, x, yy, colW - 130);
    ctx.textAlign = "right";
    ctx.fillStyle = COR.tealEscuro;
    ctx.font = `800 28px ${FONTE}`;
    ctx.fillText(milhar(it.disparos), x + colW, yy);
    ctx.strokeStyle = COR.linha;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, yy + 22);
    ctx.lineTo(x + colW, yy + 22);
    ctx.stroke();
  });
  const yc = y + 100 + linhas * 62 + 6;
  if (combo) {
    roundedRectPath(ctx, M + 48, yc, CW - 96, 76, 20);
    ctx.fillStyle = "rgba(61, 191, 184, 0.10)";
    ctx.fill();
    ctx.textAlign = "left";
    ctx.fillStyle = COR.texto;
    ctx.font = `700 27px ${FONTE}`;
    ctx.fillText(combo.procedimento, M + 76, yc + 48, CW - 96 - 56 - 200);
    ctx.textAlign = "right";
    ctx.fillStyle = COR.tealEscuro;
    ctx.font = `800 32px ${FONTE}`;
    ctx.fillText(milhar(combo.disparos), W - M - 76, yc + 50);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = COR.cinza;
  ctx.font = `italic 400 22px ${FONTE}`;
  const yNota = combo ? yc + 116 : yc + 20;
  linhasNota.forEach((l, i) => ctx.fillText(l, M + 48, yNota + i * 28));
  y += hEst + 34;

  // Rodapé.
  const hRod = 140;
  roundedRectPath(ctx, M, y, CW, hRod, 28);
  ctx.fillStyle = gradiente(ctx, M, y, CW, hRod);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "center";
  ctx.font = `700 30px ${FONTE}`;
  ctx.fillText("Mais performance para você.", W / 2, y + hRod / 2 - 6);
  ctx.font = `500 26px ${FONTE}`;
  ctx.fillText("Mais resultados para seus pacientes.", W / 2, y + hRod / 2 + 34);

  const final = document.createElement("canvas");
  final.width = W;
  final.height = Math.ceil(y + hRod + 50);
  final.getContext("2d")!.drawImage(canvas, 0, 0);
  return final;
}
