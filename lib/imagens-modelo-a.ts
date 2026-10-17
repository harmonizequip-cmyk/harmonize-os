// Modelo A (aprovado pelo dono na imagem do cálculo, 17/10/2026) aplicado às
// outras imagens que vão para a cliente: faixa da marca no topo, o principal
// num destaque em degradê logo no alto (é o que aparece na prévia do
// WhatsApp) e o detalhe em cartão branco, como recibo.

import { roundedRectPath } from "./availability-image";
import type { PricingConfig } from "./rental-pricing";
import type { DadosRecibo } from "./recibo-image";
import { ESTIMATIVAS_DISPAROS } from "./tabela-precos-arte";
import { textoDataArte, type DadosArte, type FormatoArte } from "./arte-divulgacao";

const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const COR = {
  fundo: "#F3F8F8",
  tinta: "#17202A",
  suave: "#6B7480",
  linha: "#E6ECEE",
  teal: "#1F8F88",
  rosa: "#D65A8A",
  rosaClaro: "#FDF0F5",
  rosaBorda: "#F4C6D8",
  ouro: "#A87808",
};

const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const reaisTaxa = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;
const milhar = (n: number) => n.toLocaleString("pt-BR");
const dataBr = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

function base(largura: number, altura: number, escala: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(escala, escala);
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, largura, altura);
  const f = ctx.createLinearGradient(0, 0, largura, 0);
  f.addColorStop(0, "#3DBFB8");
  f.addColorStop(0.55, "#7EC8E3");
  f.addColorStop(1, "#B8A0D0");
  ctx.fillStyle = f;
  ctx.fillRect(0, 0, largura, 5 * (largura / 440));
  return { canvas, ctx };
}

function recortar(canvas: HTMLCanvasElement, escala: number, largura: number, altura: number) {
  const s = document.createElement("canvas");
  s.width = Math.round(largura * escala);
  s.height = Math.round(altura * escala);
  (s.getContext("2d") as CanvasRenderingContext2D).drawImage(canvas, 0, 0, s.width, s.height, 0, 0, s.width, s.height);
  return s;
}

function cortar(ctx: CanvasRenderingContext2D, t: string, max: number) {
  if (ctx.measureText(t).width <= max) return t;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Cabeçalho: rótulo da marca, data à direita e título grande. Devolve o y seguinte. */
function cabecalho(ctx: CanvasRenderingContext2D, W: number, rotulo: string, direita: string | null, titulo: string, y = 30) {
  ctx.textAlign = "left";
  ctx.fillStyle = COR.teal;
  ctx.font = `800 10.5px ${FONTE}`;
  ctx.fillText(rotulo, 18, y);
  if (direita) {
    ctx.textAlign = "right";
    ctx.fillStyle = COR.suave;
    ctx.font = `600 11px ${FONTE}`;
    ctx.fillText(direita, W - 18, y);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = COR.tinta;
  ctx.font = `800 21px ${FONTE}`;
  ctx.fillText(cortar(ctx, titulo, W - 36), 18, y + 28);
  return y + 48;
}

/** Destaque em degradê com rótulo, valor grande e pílulas. */
function destaque(ctx: CanvasRenderingContext2D, W: number, y: number, rotulo: string, valor: string, pilulas: string[], alt = 160) {
  const util = W - 36;
  roundedRectPath(ctx, 18, y, util, alt, 22);
  const g = ctx.createLinearGradient(18, y, 18 + util, y + alt);
  g.addColorStop(0, "#2FB3AC");
  g.addColorStop(0.6, "#6FBFDC");
  g.addColorStop(1, "#A995CF");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  roundedRectPath(ctx, 18, y, util, alt, 22);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(18 + util - 30, y + 10, 110, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = `800 11px ${FONTE}`;
  ctx.fillText(rotulo.split("").join(" "), 40, y + 34);
  ctx.fillStyle = "#FFFFFF";
  let tam = 44;
  do {
    ctx.font = `900 ${tam}px ${FONTE}`;
    tam -= 2;
  } while (ctx.measureText(valor).width > util - 44 && tam > 22);
  ctx.fillText(valor, 38, y + 84);
  let px = 40;
  ctx.font = `700 12px ${FONTE}`;
  for (const t of pilulas) {
    const w = ctx.measureText(t).width + 22;
    if (px + w > 18 + util - 16) break;
    roundedRectPath(ctx, px, y + alt - 52, w, 26, 13);
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(t, px + 11, y + alt - 34.5);
    px += w + 8;
  }
  return y + alt;
}

type Linha = { tipo: "secao" | "linha" | "subtotal"; rotulo: string; valor?: string; detalhe?: string; tom?: "rosa" | "ouro" | "teal" };

const altLinha = (l: Linha) => (l.tipo === "secao" ? 30 : l.detalhe ? 40 : 30);

/** Cartão branco em formato de recibo. */
function recibo(ctx: CanvasRenderingContext2D, W: number, y: number, linhas: Linha[]) {
  const util = W - 36;
  const alt = 24 + linhas.reduce((s, l) => s + altLinha(l), 0) + 16;
  roundedRectPath(ctx, 18, y, util, alt, 18);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 1;
  ctx.stroke();
  let ry = y + 14;
  const xi = 36;
  const xf = W - 36;
  for (const l of linhas) {
    if (l.tipo === "secao") {
      ctx.fillStyle = COR.teal;
      ctx.font = `800 10.5px ${FONTE}`;
      ctx.textAlign = "left";
      ctx.fillText(l.rotulo.toUpperCase(), xi, ry + 22);
      ry += 30;
      continue;
    }
    const b = l.detalhe ? ry + 18 : ry + 20;
    if (l.tipo === "subtotal") {
      ctx.strokeStyle = COR.linha;
      ctx.beginPath();
      ctx.moveTo(xi, ry + 2);
      ctx.lineTo(xf, ry + 2);
      ctx.stroke();
    }
    const corV = l.tom === "rosa" ? COR.rosa : l.tom === "ouro" ? COR.ouro : l.tom === "teal" || l.tipo === "subtotal" ? COR.teal : COR.tinta;
    ctx.textAlign = "right";
    ctx.font = l.tipo === "subtotal" ? `800 15px ${FONTE}` : `700 13.5px ${FONTE}`;
    ctx.fillStyle = corV;
    const v = l.valor ?? "";
    ctx.fillText(v, xf, b);
    const lv = ctx.measureText(v).width;
    ctx.textAlign = "left";
    ctx.font = l.tipo === "subtotal" ? `700 13.5px ${FONTE}` : `500 13px ${FONTE}`;
    ctx.fillStyle = l.tipo === "subtotal" ? COR.tinta : "#3A4552";
    ctx.fillText(cortar(ctx, l.rotulo, xf - xi - lv - 12), xi, b);
    if (l.detalhe) {
      ctx.fillStyle = COR.suave;
      ctx.font = `500 11px ${FONTE}`;
      ctx.fillText(cortar(ctx, l.detalhe, xf - xi - lv - 12), xi, b + 15);
    }
    ry += altLinha(l);
  }
  return y + alt;
}

function quadroRosa(ctx: CanvasRenderingContext2D, W: number, y: number, rotulo: string, valor: string, nota: string) {
  const util = W - 36;
  roundedRectPath(ctx, 18, y, util, 74, 18);
  ctx.fillStyle = COR.rosaClaro;
  ctx.fill();
  ctx.strokeStyle = COR.rosaBorda;
  ctx.stroke();
  ctx.textAlign = "left";
  ctx.fillStyle = COR.rosa;
  ctx.font = `800 10.5px ${FONTE}`;
  ctx.fillText(rotulo, 36, y + 24);
  ctx.font = `800 20px ${FONTE}`;
  ctx.fillText(valor, 36, y + 50);
  ctx.fillStyle = COR.suave;
  ctx.font = `500 11px ${FONTE}`;
  ctx.fillText(cortar(ctx, nota, util - 36), 36, y + 66);
  return y + 74;
}

function rodape(ctx: CanvasRenderingContext2D, W: number, y: number, texto: string) {
  ctx.fillStyle = COR.suave;
  ctx.font = `500 10.5px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText(texto, W / 2, y + 26);
  return y + 40;
}

// ─── Recibo de pagamento ───

export function desenharReciboA(d: DadosRecibo): HTMLCanvasElement {
  const W = 440;
  const E = 2.5;
  const { canvas, ctx } = base(W, 700, E);
  let y = cabecalho(ctx, W, "HARMONIZE  ·  RECIBO DE PAGAMENTO", dataBr(d.dataPagamento), (d.cliente ?? "Cliente").toUpperCase());
  const quitado = d.saldo <= 0.009;
  y = destaque(ctx, W, y, "VALOR RECEBIDO", reais(d.valorPago), [d.forma, dataBr(d.dataPagamento), quitado ? "Quitado ✓" : `Falta ${reais(d.saldo)}`]);
  y += 14;
  y = recibo(ctx, W, y, [
    { tipo: "secao", rotulo: "Locação" },
    { tipo: "linha", rotulo: d.equipamento ?? "Equipamento", valor: d.periodo },
    { tipo: "linha", rotulo: "Valor da locação", valor: reais(d.totalLocacao) },
    { tipo: "linha", rotulo: "Total já pago", valor: reais(d.totalPago), tom: "teal" },
    quitado ? { tipo: "subtotal", rotulo: "Situação", valor: "Quitado ✓" } : { tipo: "subtotal", rotulo: "Saldo em aberto", valor: reais(d.saldo), tom: "ouro" },
  ]);
  y = rodape(ctx, W, y, "Obrigado pela confiança!  ·  Harmonize, locação de equipamentos");
  return recortar(canvas, E, W, Math.ceil(y));
}

// ─── Datas livres (calendário do mês) ───

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

export function desenharDatasA(p: { daysInMonth: Date[]; selectedDays: Set<string>; busyDates: Set<string>; today: Date }): HTMLCanvasElement {
  const W = 440;
  const E = 2.5;
  const chave = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const mes = p.daysInMonth[0];
  const livres = p.daysInMonth.filter((d) => p.selectedDays.has(chave(d)));
  const linhas = Math.ceil((mes.getDay() + p.daysInMonth.length) / 7);
  const { canvas, ctx } = base(W, 900, E);
  let y = cabecalho(ctx, W, "HARMONIZE  ·  AGENDA DO HIPRO", null, `${MESES[mes.getMonth()]} ${mes.getFullYear()}`);
  const primeiros = livres.slice(0, 4).map((d) => `${SEMANA[d.getDay()].charAt(0)}${SEMANA[d.getDay()].slice(1).toLowerCase()} ${d.getDate()}`);
  y = destaque(ctx, W, y, "DATAS DISPONÍVEIS", `${livres.length} ${livres.length === 1 ? "dia livre" : "dias livres"}`, primeiros);
  y += 14;

  // Calendário
  const util = W - 36;
  const cel = (util - 24) / 7;
  const altCal = 20 + 22 + linhas * (cel * 0.86) + 14;
  roundedRectPath(ctx, 18, y, util, altCal, 18);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = COR.linha;
  ctx.stroke();
  const x0 = 30;
  ctx.textAlign = "center";
  ctx.font = `800 9.5px ${FONTE}`;
  SEMANA.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? "#C9A0A0" : COR.suave;
    ctx.fillText(s, x0 + cel * i + cel / 2, y + 28);
  });
  const hoje = new Date(p.today.getFullYear(), p.today.getMonth(), p.today.getDate());
  p.daysInMonth.forEach((d, i) => {
    const pos = mes.getDay() + i;
    const cx = x0 + cel * (pos % 7) + cel / 2;
    const cy = y + 42 + Math.floor(pos / 7) * (cel * 0.86) + cel * 0.43;
    const k = chave(d);
    const livre = p.selectedDays.has(k);
    const ocupado = p.busyDates.has(k);
    const passado = d < hoje;
    if (livre) {
      roundedRectPath(ctx, cx - cel * 0.4, cy - cel * 0.34, cel * 0.8, cel * 0.68, 10);
      const g = ctx.createLinearGradient(cx - 20, cy - 20, cx + 20, cy + 20);
      g.addColorStop(0, "#2FB3AC");
      g.addColorStop(1, "#6FBFDC");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      ctx.font = `800 15px ${FONTE}`;
    } else if (ocupado) {
      ctx.fillStyle = "#C3CACF";
      ctx.font = `600 13px ${FONTE}`;
    } else {
      ctx.fillStyle = passado || d.getDay() === 0 ? "#D3D8DC" : "#9AA3AD";
      ctx.font = `600 13px ${FONTE}`;
    }
    ctx.fillText(String(d.getDate()), cx, cy + 5);
    if (ocupado && !livre) {
      ctx.strokeStyle = "#D7DCE0";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx - 9, cy + 1);
      ctx.lineTo(cx + 9, cy + 1);
      ctx.stroke();
    }
  });
  y += altCal + 10;
  // legenda
  ctx.textAlign = "left";
  ctx.font = `600 11px ${FONTE}`;
  roundedRectPath(ctx, 30, y + 4, 14, 12, 4);
  ctx.fillStyle = "#2FB3AC";
  ctx.fill();
  ctx.fillStyle = COR.suave;
  ctx.fillText("Disponível", 50, y + 14);
  ctx.fillStyle = "#C3CACF";
  ctx.fillText("—", 130, y + 14);
  ctx.fillStyle = COR.suave;
  ctx.fillText("Já reservado", 146, y + 14);
  y += 26;
  // chamada
  roundedRectPath(ctx, 18, y, util, 44, 22);
  const g = ctx.createLinearGradient(18, y, 18 + util, y);
  g.addColorStop(0, "#2E9A94");
  g.addColorStop(0.55, "#4A9BC4");
  g.addColorStop(1, "#8F72B0");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 12px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText("RESERVE SUA DATA E GARANTA O HIPRO", W / 2, y + 27);
  y += 44;
  y = rodape(ctx, W, y, "Harmonize  ·  locação de equipamentos médicos e estéticos");
  return recortar(canvas, E, W, Math.ceil(y));
}

// ─── Tabela de preços ───

export function desenharTabelaA(cfg: PricingConfig, taxaReserva: number): HTMLCanvasElement {
  const W = 440;
  const E = 2.5;
  const { canvas, ctx } = base(W, 1200, E);
  let y = cabecalho(ctx, W, "HARMONIZE  ·  TABELA DE PREÇOS", null, "LOCAÇÃO DO HIPRO");
  y = destaque(ctx, W, y, "PACOTE ATÉ " + milhar(cfg.flatPackageLimit) + " DISPAROS", reais(cfg.flatPackageValue), ["Sem mínimo de disparos", "Você paga o que usar"]);
  y += 14;
  y = recibo(ctx, W, y, [
    { tipo: "secao", rotulo: "Faixas de preço" },
    { tipo: "linha", rotulo: `Até ${milhar(cfg.flatPackageLimit)} disparos`, detalhe: "Pacote fixo", valor: reais(cfg.flatPackageValue) },
    { tipo: "linha", rotulo: `De ${milhar(cfg.flatPackageLimit + 1)} a ${milhar(cfg.tier2Limit)}`, detalhe: `Pacote + cada disparo acima de ${milhar(cfg.flatPackageLimit)}`, valor: `+ ${reaisTaxa(cfg.tier2Rate)}` },
    { tipo: "linha", rotulo: `Acima de ${milhar(cfg.tier2Limit)} disparos`, detalhe: "Por disparo, sobre o total", valor: reaisTaxa(cfg.tier3Rate) },
    { tipo: "secao", rotulo: "Estimativa de disparos" },
    ...ESTIMATIVAS_DISPAROS.map((e): Linha => ({ tipo: "linha", rotulo: e.procedimento, valor: milhar(e.disparos) })),
  ]);
  y += 12;
  y = quadroRosa(ctx, W, y, "RESERVA DE AGENDA", reais(taxaReserva), "Vira crédito na locação: não é taxa adicional.");
  y += 12;
  y = recibo(ctx, W, y, [
    { tipo: "secao", rotulo: "Informações importantes" },
    { tipo: "linha", rotulo: "Deslocamento cobrado à parte, conforme o local" },
    { tipo: "linha", rotulo: "Valores referentes ao uso do equipamento HIPRO" },
    { tipo: "linha", rotulo: "Pacote válido para uma locação (até 12 horas)" },
    { tipo: "linha", rotulo: "Estimativas médias: variam com a avaliação" },
  ]);
  y = rodape(ctx, W, y, "Harmonize  ·  locação de equipamentos médicos e estéticos");
  return recortar(canvas, E, W, Math.ceil(y));
}

// ─── Arte para a cliente divulgar (sem a marca da Harmonize) ───

export function desenharArteA(d: DadosArte, formato: FormatoArte): HTMLCanvasElement {
  const W = 1080;
  const H = formato === "story" ? 1920 : 1350;
  // Primeiro mede a altura do conteúdo, depois desenha centralizado na arte.
  const rascunho = document.createElement("canvas");
  rascunho.width = W;
  rascunho.height = H;
  const usado = corpoArte(rascunho.getContext("2d") as CanvasRenderingContext2D, d, formato, 0);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, W, H);
  const f = ctx.createLinearGradient(0, 0, W, 0);
  f.addColorStop(0, "#3DBFB8");
  f.addColorStop(0.55, "#7EC8E3");
  f.addColorStop(1, "#B8A0D0");
  ctx.fillStyle = f;
  ctx.fillRect(0, 0, W, 14);
  ctx.fillRect(0, H - 14, W, 14);
  corpoArte(ctx, d, formato, Math.max(60, (H - usado) / 2));
  return canvas;
}

function corpoArte(ctx: CanvasRenderingContext2D, d: DadosArte, formato: FormatoArte, inicio: number): number {
  const W = 1080;
  const s = formato === "story" ? 1.15 : 0.86;
  const cx = W / 2;
  let y = inicio + 40 * s;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COR.teal;
  ctx.font = `800 ${30 * s}px ${FONTE}`;
  (ctx as any).letterSpacing = "8px";
  ctx.fillText("AGENDA ABERTA", cx, y);
  (ctx as any).letterSpacing = "0px";
  y += 120 * s;
  ctx.fillStyle = COR.tinta;
  let tam = 120 * s;
  do {
    ctx.font = `900 ${tam}px ${FONTE}`;
    tam -= 4;
  } while (ctx.measureText(d.titulo).width > W - 160 && tam > 50);
  ctx.fillText(d.titulo, cx, y);
  y += 70 * s;
  ctx.fillStyle = COR.suave;
  ctx.font = `500 ${40 * s}px ${FONTE}`;
  const palavras = d.subtitulo.split(" ");
  let lin = "";
  const linhas: string[] = [];
  for (const p of palavras) {
    if (ctx.measureText(`${lin} ${p}`.trim()).width > W - 200 && lin) {
      linhas.push(lin);
      lin = p;
    } else lin = `${lin} ${p}`.trim();
  }
  if (lin) linhas.push(lin);
  linhas.slice(0, 3).forEach((l, i) => ctx.fillText(l, cx, y + i * 52 * s));
  y += linhas.slice(0, 3).length * 52 * s + 60 * s;

  // destaque da data
  const dt = textoDataArte(d.dataInicio, d.dataFim);
  const alt = 330 * s;
  roundedRectPath(ctx, 90, y, W - 180, alt, 56);
  const g = ctx.createLinearGradient(90, y, W - 90, y + alt);
  g.addColorStop(0, "#2FB3AC");
  g.addColorStop(0.6, "#6FBFDC");
  g.addColorStop(1, "#A995CF");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  roundedRectPath(ctx, 90, y, W - 180, alt, 56);
  ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.beginPath();
  ctx.arc(W - 160, y + 20, 260, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.font = `800 ${34 * s}px ${FONTE}`;
  (ctx as any).letterSpacing = "6px";
  ctx.fillText(dt.linha1.toUpperCase(), cx, y + 100 * s);
  (ctx as any).letterSpacing = "0px";
  ctx.fillStyle = "#FFFFFF";
  tam = 104 * s;
  do {
    ctx.font = `900 ${tam}px ${FONTE}`;
    tam -= 4;
  } while (ctx.measureText(dt.linha2).width > W - 260 && tam > 40);
  ctx.fillText(dt.linha2, cx, y + 230 * s);
  y += alt + 50 * s;

  // local
  const altL = 210 * s;
  roundedRectPath(ctx, 90, y, W - 180, altL, 48);
  ctx.fillStyle = "#FFFFFF";
  ctx.fill();
  ctx.strokeStyle = COR.linha;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = COR.teal;
  ctx.font = `800 ${26 * s}px ${FONTE}`;
  (ctx as any).letterSpacing = "5px";
  ctx.fillText("ONDE", cx, y + 64 * s);
  (ctx as any).letterSpacing = "0px";
  ctx.fillStyle = COR.tinta;
  ctx.font = `800 ${54 * s}px ${FONTE}`;
  ctx.fillText(cortar(ctx, d.local, W - 260), cx, y + 132 * s);
  ctx.fillStyle = COR.suave;
  ctx.font = `500 ${38 * s}px ${FONTE}`;
  ctx.fillText(cortar(ctx, d.cidade, W - 260), cx, y + 182 * s);
  y += altL + 70 * s;

  // chamada
  ctx.fillStyle = COR.tinta;
  ctx.font = `800 ${46 * s}px ${FONTE}`;
  ctx.fillText(cortar(ctx, d.chamada, W - 200), cx, y);
  y += 40 * s;
  if (d.contato) {
    ctx.font = `800 ${44 * s}px ${FONTE}`;
    const t = `WhatsApp ${d.contato}`;
    const w = ctx.measureText(t).width + 100;
    roundedRectPath(ctx, cx - w / 2, y, w, 104 * s, 52 * s);
    ctx.fillStyle = "#1FAF63";
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.fillText(t, cx, y + 68 * s);
    y += 104 * s;
  }
  return y - inicio;
}
