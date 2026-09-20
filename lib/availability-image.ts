import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Mesmas cores da identidade visual (ver tailwind.config), só que em hex puro
// porque canvas não entende classes do Tailwind.
const COLORS = {
  teal: "#3DBFB8",
  ink: "#1f2937",
  muted: "#9aa3ad",
  closed: "#c17a6e",
};

// Versões mais profundas das mesmas cores da marca, só para o botão de
// chamada no rodapé — o tom pastel original fica ótimo em área pequena,
// mas com texto branco em cima o azul/lilás claros quase lavam a letra.
const CTA_COLORS = {
  teal: "#2e9a94",
  blue: "#4a9bc4",
  lilac: "#8f72b0",
};

// Resolução 2x: desenha tudo nas mesmas coordenadas "lógicas" de sempre,
// só que o canvas físico sai com o dobro de pixels (ctx.scale cuida da
// conversão), pra imagem ficar nítida mesmo em tela de retina/zoom.
const SCALE = 2;

const WEEKDAY_LABELS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function toDateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// Escreve um texto em letras separadas por um espaçamento fixo, centralizado
// em centerX — canvas não tem "letter-spacing" nativo, então isso simula um
// efeito discreto de caixa-alta espaçada (usado só no subtítulo pequeno).
function fillTextSpaced(ctx: CanvasRenderingContext2D, text: string, centerX: number, y: number, spacing: number) {
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = centerX - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  chars.forEach((ch, i) => {
    ctx.fillText(ch, x, y);
    x += widths[i] + spacing;
  });
  ctx.textAlign = prevAlign;
}

// Escreve duas partes na mesma linha, cada uma com sua cor, centralizadas
// juntas como um bloco só — usado pro "Setembro" (escuro) + "2026" (cor de
// destaque) do título.
function fillTwoTone(
  ctx: CanvasRenderingContext2D,
  partA: string,
  partB: string,
  colorA: string,
  colorB: string,
  centerX: number,
  y: number
) {
  const gap = ctx.measureText(" ").width * 1.2;
  const wA = ctx.measureText(partA).width;
  const wB = ctx.measureText(partB).width;
  const total = wA + gap + wB;
  let x = centerX - total / 2;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  ctx.fillStyle = colorA;
  ctx.fillText(partA, x, y);
  x += wA + gap;
  ctx.fillStyle = colorB;
  ctx.fillText(partB, x, y);
  ctx.textAlign = prevAlign;
}

/**
 * Desenha a imagem de disponibilidade como um calendário do mês inteiro
 * (igual um calendário de parede): uma célula por dia, com um círculo em
 * volta dos dias já reservados (evento de HIPRO 1/2 marcado, ou desmarcado
 * na mão pelo usuário por algum motivo de logística). Domingo aparece em
 * um tom diferente (fechado por padrão) e dia passado sai apagado — sem
 * precisar de legenda extra pra cada caso. Só usa Canvas nativo (sem lib
 * nova) porque o resultado é só uma imagem estática pra baixar/compartilhar.
 */
export async function drawAvailabilityImage({
  daysInMonth,
  selectedDays,
  busyDates,
  today,
}: {
  daysInMonth: Date[];
  selectedDays: Set<string>;
  busyDates: Set<string>;
  today: Date;
}): Promise<HTMLCanvasElement> {
  const width = 1080;
  const cardMarginX = 64;
  const cardWidth = width - cardMarginX * 2;
  const colWidth = cardWidth / 7;

  const firstWeekday = daysInMonth[0].getDay();
  const totalCells = firstWeekday + daysInMonth.length;
  const numRows = Math.ceil(totalCells / 7);

  const headerTop = 64;
  const badgeR = 56;
  const badgeCenterY = headerTop + badgeR;
  const titleY = badgeCenterY + badgeR + 84;
  const subtitleY = titleY + 44;
  const cardY = subtitleY + 56;

  const cardPaddingTop = 30;
  const weekdayRowH = 58;
  const dayRowH = 104;
  const cardPaddingBottom = 26;
  const cardHeight = cardPaddingTop + weekdayRowH + numRows * dayRowH + cardPaddingBottom;

  const legendGap = 34;
  const legendH = 30;
  const ctaGap = 30;
  const ctaH = 108;
  const bottomMargin = 56;

  const height = cardY + cardHeight + legendGap + legendH + ctaGap + ctaH + bottomMargin;

  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador.");
  ctx.scale(SCALE, SCALE);

  // Fundo bem suave, quase branco, só pra não ficar um branco chapado atrás
  // do cartão — sem padrão nem ilustração, pra não poluir.
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#f6f9fa");
  bgGrad.addColorStop(1, "#f4f1f8");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Selo redondo branco com a borboleta da marca, centralizado no topo.
  try {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.14)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(width / 2, badgeCenterY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();

    const butterfly = await loadImage("/harmonize-borboleta.png");
    const innerH = badgeR * 1.5;
    const innerW = (butterfly.width / butterfly.height) * innerH;
    ctx.drawImage(butterfly, width / 2 - innerW / 2, badgeCenterY - innerH / 2, innerW, innerH);
  } catch {
    // Sem o selo se o arquivo não carregar por algum motivo — a imagem
    // ainda fica utilizável, só sem a marca no topo.
  }

  // Título: nome do mês em tinta escura + ano em destaque, como um bloco só.
  const monthNameRaw = format(daysInMonth[0], "MMMM", { locale: ptBR });
  const monthName = monthNameRaw.charAt(0).toUpperCase() + monthNameRaw.slice(1);
  const year = format(daysInMonth[0], "yyyy");
  ctx.textBaseline = "alphabetic";
  ctx.font = "bold 60px system-ui, -apple-system, sans-serif";
  fillTwoTone(ctx, monthName, year, COLORS.ink, CTA_COLORS.teal, width / 2, titleY);

  // Subtítulo pequeno, espaçado, em caixa-alta.
  ctx.font = "600 22px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.teal;
  ctx.textAlign = "center";
  fillTextSpaced(ctx, "AGENDA DISPONÍVEL", width / 2, subtitleY, 4);

  // Cartão branco com a grade do mês.
  ctx.save();
  ctx.shadowColor = "rgba(31,41,55,0.08)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  roundedRectPath(ctx, cardMarginX, cardY, cardWidth, cardHeight, 28);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  // Cabeçalho de dias da semana.
  const weekdayY = cardY + cardPaddingTop + 34;
  ctx.font = "700 21px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  WEEKDAY_LABELS.forEach((label, i) => {
    const x = cardMarginX + colWidth * (i + 0.5);
    ctx.fillStyle = i === 0 ? COLORS.closed : COLORS.muted;
    ctx.fillText(label, x, weekdayY);
  });

  // Grade de dias.
  const gridTop = cardY + cardPaddingTop + weekdayRowH;
  daysInMonth.forEach((day, idx) => {
    const cellIndex = firstWeekday + idx;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);
    const cx = cardMarginX + colWidth * (col + 0.5);
    const cy = gridTop + dayRowH * row + dayRowH / 2;

    const key = toDateKey(day);
    const isPast = day.getTime() < today.getTime();
    const isBusy = busyDates.has(key);
    const isSunday = day.getDay() === 0;
    const isAvailable = selectedDays.has(key);
    // Círculo aparece quando o dia está reservado de verdade (evento
    // marcado) ou foi desmarcado na mão — domingo por si só não ganha
    // círculo, só um tom diferente de número, pra não poluir a grade com
    // um círculo em todo domingo do mês.
    const needsRing = !isPast && (isBusy || (!isSunday && !isAvailable));

    if (needsRing) {
      ctx.beginPath();
      ctx.arc(cx, cy, 36, 0, Math.PI * 2);
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = COLORS.teal;
      ctx.stroke();
    }

    ctx.font = "700 32px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (isPast) {
      ctx.fillStyle = "#d7dbe0";
    } else if (isSunday && !isBusy) {
      ctx.fillStyle = COLORS.closed;
    } else {
      ctx.fillStyle = COLORS.ink;
    }
    ctx.fillText(String(day.getDate()), cx, cy + 1);
  });

  // Legenda mínima, só pra explicar o círculo.
  const legendY = cardY + cardHeight + legendGap + legendH / 2;
  const legendTextWidthGuess = 210; // suficiente pro texto abaixo, pra centralizar o par círculo+texto
  const legendCx = width / 2 - legendTextWidthGuess / 2;
  ctx.beginPath();
  ctx.arc(legendCx, legendY, 12, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.teal;
  ctx.stroke();
  ctx.font = "500 22px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Dia já reservado", legendCx + 24, legendY + 1);

  // Botão de chamada, em formato de pílula.
  const ctaY = legendY + legendH / 2 + ctaGap;
  const ctaX = cardMarginX;
  const ctaWidth = cardWidth;
  const ctaRadius = ctaH / 2;
  const ctaGrad = ctx.createLinearGradient(ctaX, ctaY, ctaX + ctaWidth, ctaY + ctaH);
  ctaGrad.addColorStop(0, CTA_COLORS.teal);
  ctaGrad.addColorStop(0.55, CTA_COLORS.blue);
  ctaGrad.addColorStop(1, CTA_COLORS.lilac);
  ctx.save();
  ctx.shadowColor = "rgba(46,154,148,0.35)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  roundedRectPath(ctx, ctaX, ctaY, ctaWidth, ctaH, ctaRadius);
  ctx.fillStyle = ctaGrad;
  ctx.fill();
  ctx.restore();

  ctx.font = "600 32px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Fale comigo para garantir sua data 💬", ctaX + ctaWidth / 2, ctaY + ctaH / 2 + 1);

  return canvas;
}

export function canvasToPngFile(canvas: HTMLCanvasElement, filename: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Não foi possível gerar a imagem."));
        return;
      }
      resolve(new File([blob], filename, { type: "image/png" }));
    }, "image/png");
  });
}
