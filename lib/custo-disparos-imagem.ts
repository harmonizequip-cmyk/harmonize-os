// Imagem "Distribuição por área" + "Cálculo do valor total" (layout enviado pelo dono em
// 22/10/2026): tabela com foto, profundidade, direito, esquerdo, quadrantes e total de cada
// área, o total geral de disparos e três cartões com o total vezes R$ 0,12, 0,10 e 0,07.
// A montagem dos números (montarTabelaCusto) é separada do desenho para testar sem canvas.

import { roundedRectPath } from "./availability-image";
import { custoDisparos } from "./custo-disparos";
import { imagemDaArea } from "./planejador-impressao";
import { subtotalLinha, todasAreas, type Plano } from "./planejador";

export interface LinhaTabela {
  prof: string;
  dir?: number;
  esq?: number;
  unico?: number;
  quad?: number;
  total: number;
}

export interface GrupoTabela {
  id: string;
  nome: string;
  linhas: LinhaTabela[];
  total: number;
}

/** Só as áreas e profundidades com disparos, na ordem da tela, e o total geral. */
export function montarTabelaCusto(p: Plano): { grupos: GrupoTabela[]; total: number } {
  const grupos: GrupoTabela[] = [];
  for (const a of todasAreas(p)) {
    const linhas: LinhaTabela[] = [];
    for (const r of p.DATA[a.id] ?? []) {
      const total = subtotalLinha(a, r);
      if (total <= 0) continue;
      const corporal = a.regiao === "corporal";
      linhas.push(
        a.bilateral
          ? { prof: r.prof, dir: r.dispD ?? 0, esq: r.dispE ?? 0, ...(corporal ? { quad: Math.max(1, r.quad ?? 1) } : {}), total }
          : { prof: r.prof, unico: r.disp ?? 0, ...(corporal ? { quad: Math.max(1, r.quad ?? 1) } : {}), total }
      );
    }
    if (linhas.length) grupos.push({ id: a.id, nome: a.nome, linhas, total: linhas.reduce((t, l) => t + l.total, 0) });
  }
  return { grupos, total: grupos.reduce((t, g) => t + g.total, 0) };
}

const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const milhar = (n: number) => n.toLocaleString("pt-BR");
const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const taxaTxt = (t: number) => `R$ ${t.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

const CARTOES = [
  { fundo: "#FDE4EB", titulo: "#9D1747", botao: "#E0245E" },
  { fundo: "#D9F7F4", titulo: "#0B4F4A", botao: "#0F8A80" },
  { fundo: "#EDE7FB", titulo: "#3B1A7A", botao: "#6D3FC0" },
  { fundo: "#FFF1D6", titulo: "#7A4B00", botao: "#D98A00" },
];

const W = 1080;
const X0 = 22;
const COLS = [22, 430, 570, 681, 820, 931, 1058]; // área, profund., direito, esquerdo, quad., total
const ALT_LINHA = 52;

function grad(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

export async function carregarFotosAreas(p: Plano): Promise<Record<string, HTMLImageElement | null>> {
  const fotos: Record<string, HTMLImageElement | null> = {};
  await Promise.all(
    montarTabelaCusto(p).grupos.map(
      (g) =>
        new Promise<void>((ok) => {
          const area = todasAreas(p).find((a) => a.id === g.id);
          if (!area) return ok();
          const img = new Image();
          img.onload = () => {
            fotos[g.id] = img;
            ok();
          };
          img.onerror = () => {
            fotos[g.id] = null;
            ok();
          };
          img.src = imagemDaArea(area, "");
        })
    )
  );
  return fotos;
}

export function drawCustoDisparos(p: Plano, taxas: number[], fotos: Record<string, HTMLImageElement | null>): HTMLCanvasElement {
  const { grupos, total } = montarTabelaCusto(p);
  const alturasGrupo = grupos.map((g) => Math.max(g.linhas.length * ALT_LINHA, 104));
  const colunasCartao = taxas.length > 3 ? 2 : 3;
  const linhasCartao = Math.ceil(taxas.length / colunasCartao);
  const ALT_CARTAO = 330;
  const H = 40 + 86 + 14 + 54 + alturasGrupo.reduce((t, h) => t + h, 0) + 82 + 78 + 30 + 120 + linhasCartao * (ALT_CARTAO + 22) + 40;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "middle";

  let y = 30;
  // Título
  roundedRectPath(ctx, X0, y, W - 2 * X0, 86, 22);
  ctx.fillStyle = grad(ctx, X0, y, W - 2 * X0, 86, "#0B8F8A", "#3FD7E0");
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 46px ${FONTE}`;
  ctx.textAlign = "left";
  ctx.fillText("DISTRIBUIÇÃO POR ÁREA", X0 + 26, y + 44);
  y += 86 + 14;

  // Cabeçalho da tabela
  ctx.fillStyle = "#E6F7F7";
  ctx.fillRect(X0, y, COLS[6] - X0, 54);
  ctx.fillStyle = "#0F7D78";
  ctx.font = `800 22px ${FONTE}`;
  const titulos: [string, number, CanvasTextAlign][] = [
    ["ÁREA", (COLS[0] + COLS[1]) / 2 - 90, "center"],
    ["PROFUND.", (COLS[1] + COLS[2]) / 2, "center"],
    ["DIREITO", (COLS[2] + COLS[3]) / 2, "center"],
    ["ESQUERDO", (COLS[3] + COLS[4]) / 2, "center"],
    ["QUAD.", (COLS[4] + COLS[5]) / 2, "center"],
    ["TOTAL", (COLS[5] + COLS[6]) / 2, "center"],
  ];
  for (const [t, x, al] of titulos) {
    ctx.textAlign = al;
    ctx.fillText(t, x, y + 28);
  }
  y += 54;

  // Grupos
  grupos.forEach((g, gi) => {
    const h = alturasGrupo[gi];
    const topo = y;
    ctx.fillStyle = gi % 2 === 0 ? "#FFFFFF" : "#EAF8F8";
    ctx.fillRect(X0, topo, COLS[6] - X0, h);
    // linhas de grade
    ctx.strokeStyle = "#CFE7E6";
    ctx.lineWidth = 1.5;
    for (let c = 1; c < COLS.length - 1; c++) {
      ctx.beginPath();
      ctx.moveTo(COLS[c], topo);
      ctx.lineTo(COLS[c], topo + h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(X0, topo + h);
    ctx.lineTo(COLS[6], topo + h);
    ctx.stroke();
    // foto
    const foto = fotos[g.id];
    const lado = 92;
    const fx = X0 + 24;
    const fy = topo + (h - lado) / 2;
    ctx.save();
    roundedRectPath(ctx, fx, fy, lado, lado, 18);
    ctx.clip();
    if (foto && foto.naturalWidth) {
      const s = Math.max(lado / foto.naturalWidth, lado / foto.naturalHeight);
      ctx.drawImage(foto, fx + (lado - foto.naturalWidth * s) / 2, fy + (lado - foto.naturalHeight * s) / 2, foto.naturalWidth * s, foto.naturalHeight * s);
    } else {
      ctx.fillStyle = "#E6F1F1";
      ctx.fillRect(fx, fy, lado, lado);
      ctx.fillStyle = "#0F7D78";
      ctx.font = `800 40px ${FONTE}`;
      ctx.textAlign = "center";
      ctx.fillText((g.nome[0] ?? "?").toUpperCase(), fx + lado / 2, fy + lado / 2);
    }
    ctx.restore();
    // nome
    ctx.fillStyle = "#1F2937";
    ctx.textAlign = "left";
    let tam = 30;
    ctx.font = `500 ${tam}px ${FONTE}`;
    const maxNome = COLS[1] - (fx + lado + 18) - 10;
    while (ctx.measureText(g.nome).width > maxNome && tam > 18) {
      tam -= 1;
      ctx.font = `500 ${tam}px ${FONTE}`;
    }
    ctx.fillText(g.nome, fx + lado + 18, topo + h / 2);
    // linhas
    const hl = h / g.linhas.length;
    g.linhas.forEach((l, li) => {
      const cy = topo + li * hl + hl / 2;
      if (li > 0) {
        ctx.beginPath();
        ctx.moveTo(COLS[1], topo + li * hl);
        ctx.lineTo(COLS[6], topo + li * hl);
        ctx.stroke();
      }
      ctx.fillStyle = "#1F2937";
      ctx.font = `500 26px ${FONTE}`;
      ctx.textAlign = "center";
      ctx.fillText(`${Number(l.prof).toFixed(1)} mm`, (COLS[1] + COLS[2]) / 2, cy);
      if (l.unico !== undefined) {
        ctx.fillText(`${milhar(l.unico)} (único)`, (COLS[2] + COLS[4]) / 2, cy);
      } else {
        ctx.fillText(milhar(l.dir ?? 0), (COLS[2] + COLS[3]) / 2, cy);
        ctx.fillText(milhar(l.esq ?? 0), (COLS[3] + COLS[4]) / 2, cy);
      }
      ctx.fillText(l.quad ? String(l.quad) : "–", (COLS[4] + COLS[5]) / 2, cy);
      ctx.font = `800 27px ${FONTE}`;
      ctx.fillText(milhar(l.total), (COLS[5] + COLS[6]) / 2, cy);
    });
    y += h;
  });

  // Total geral
  roundedRectPath(ctx, X0, y + 4, COLS[6] - X0, 78, 18);
  ctx.fillStyle = grad(ctx, X0, y, COLS[6] - X0, 78, "#0B8F8A", "#056A66");
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 32px ${FONTE}`;
  ctx.textAlign = "left";
  ctx.fillText("TOTAL GERAL DE DISPAROS", X0 + 24, y + 44);
  ctx.font = `800 56px ${FONTE}`;
  ctx.textAlign = "right";
  ctx.fillText(milhar(total), COLS[6] - 26, y + 44);
  y += 82 + 14;

  // Observação
  ctx.fillStyle = "#4B5563";
  ctx.font = `400 21px ${FONTE}`;
  ctx.textAlign = "left";
  ctx.fillText("Obs.: Disparos distribuídos por profundidade e lado conforme a área anatômica.", X0 + 10, y + 12);
  y += 62;

  // Cálculo do valor total
  roundedRectPath(ctx, X0, y, COLS[6] - X0, 110, 22);
  ctx.fillStyle = grad(ctx, X0, y, COLS[6] - X0, 110, "#0B8F8A", "#4FD9D4");
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `800 54px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText("CÁLCULO DO VALOR TOTAL", W / 2, y + 42);
  ctx.font = `400 26px ${FONTE}`;
  ctx.fillText(`Com base em ${milhar(total)} disparos`, W / 2, y + 86);
  y += 110 + 22;

  // Cartões
  const larg = (COLS[6] - X0 - 20 * (colunasCartao - 1)) / colunasCartao;
  taxas.forEach((t, i) => {
    const col = i % colunasCartao;
    const lin = Math.floor(i / colunasCartao);
    const x = X0 + col * (larg + 20);
    const cy0 = y + lin * (ALT_CARTAO + 22);
    const c = CARTOES[Math.min(i, CARTOES.length - 1)];
    roundedRectPath(ctx, x, cy0, larg, ALT_CARTAO, 26);
    ctx.fillStyle = c.fundo;
    ctx.fill();
    ctx.textAlign = "center";
    ctx.fillStyle = c.titulo;
    ctx.font = `800 52px ${FONTE}`;
    ctx.fillText(taxaTxt(t), x + larg / 2, cy0 + 52);
    ctx.font = `800 26px ${FONTE}`;
    ctx.fillText("POR DISPARO", x + larg / 2, cy0 + 100);
    ctx.strokeStyle = "rgba(15,23,42,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 24, cy0 + 130);
    ctx.lineTo(x + larg - 24, cy0 + 130);
    ctx.stroke();
    ctx.fillStyle = "#1F2937";
    ctx.font = `400 26px ${FONTE}`;
    ctx.fillText(`${milhar(total)} × ${taxaTxt(t)}`, x + larg / 2, cy0 + 168);
    ctx.beginPath();
    ctx.moveTo(x + 24, cy0 + 200);
    ctx.lineTo(x + larg - 24, cy0 + 200);
    ctx.stroke();
    ctx.fillStyle = c.titulo;
    ctx.font = `800 22px ${FONTE}`;
    ctx.fillText("VALOR TOTAL", x + larg / 2, cy0 + 230);
    roundedRectPath(ctx, x + 14, cy0 + 252, larg - 28, 64, 16);
    ctx.fillStyle = c.botao;
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    let tamV = 42;
    const valor = reais(custoDisparos(total, t));
    ctx.font = `800 ${tamV}px ${FONTE}`;
    while (ctx.measureText(valor).width > larg - 48 && tamV > 22) {
      tamV -= 1;
      ctx.font = `800 ${tamV}px ${FONTE}`;
    }
    ctx.fillText(valor, x + larg / 2, cy0 + 285);
  });
  return canvas;
}
