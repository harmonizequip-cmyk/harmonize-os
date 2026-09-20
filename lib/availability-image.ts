import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Mesmas cores da identidade visual (ver tailwind.config), só que em hex puro
// porque canvas não entende classes do Tailwind.
const COLORS = {
  teal: "#3DBFB8",
  blue: "#7EC8E3",
  lilac: "#B8A0D0",
  ink: "#1f2937",
  muted: "#6b7280",
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Desenha a imagem de "datas disponíveis" pra mandar pro cliente: cabeçalho
 * com a marca, uma linha por dia livre e um rodapé de chamada. Só usa Canvas
 * nativo (sem lib nova) porque o resultado é só uma imagem estática pra
 * baixar/compartilhar, nada interativo.
 */
export async function drawAvailabilityImage(days: Date[], monthLabel: string): Promise<HTMLCanvasElement> {
  const width = 1080;
  const rowHeight = 116;
  const headerHeight = 340;
  const footerHeight = 140;
  const listHeight = days.length > 0 ? days.length * rowHeight : 140;
  const height = headerHeight + listHeight + footerHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não suportado neste navegador.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const headerGrad = ctx.createLinearGradient(0, 0, width, headerHeight);
  headerGrad.addColorStop(0, COLORS.teal);
  headerGrad.addColorStop(0.55, COLORS.blue);
  headerGrad.addColorStop(1, COLORS.lilac);
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, width, headerHeight);

  try {
    // Usa a versão com texto escuro (não a "-dark", pensada pra fundo escuro
    // de verdade) porque o cabeçalho aqui é um degradê claro (teal/azul/lilás
    // pastel) — a versão de texto branco ficava lavada e quase invisível
    // em cima dele.
    const logo = await loadImage("/harmonize-logo-full.png");
    const logoH = 64;
    const logoW = (logo.width / logo.height) * logoH;
    ctx.drawImage(logo, (width - logoW) / 2, 56, logoW, logoH);
  } catch {
    // Segue sem logo se o arquivo não carregar por algum motivo — a imagem
    // ainda fica utilizável, só sem a marca no topo.
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px system-ui, -apple-system, sans-serif";
  ctx.fillText("Datas disponíveis", width / 2, 220);
  ctx.font = "normal 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(monthLabel, width / 2, 268);

  if (days.length === 0) {
    ctx.fillStyle = COLORS.muted;
    ctx.font = "normal 32px system-ui, -apple-system, sans-serif";
    ctx.fillText("Nenhuma data livre nesse mês.", width / 2, headerHeight + 80);
  }

  days.forEach((day, i) => {
    const rowTop = headerHeight + i * rowHeight;
    const centerY = rowTop + rowHeight / 2;

    if (i > 0) {
      ctx.strokeStyle = "#eef0f2";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(64, rowTop);
      ctx.lineTo(width - 64, rowTop);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(120, centerY, 42, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.teal;
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(day.getDate()), 120, centerY + 2);

    ctx.textAlign = "left";
    ctx.fillStyle = COLORS.ink;
    ctx.font = "bold 36px system-ui, -apple-system, sans-serif";
    const weekday = format(day, "EEEE", { locale: ptBR });
    ctx.fillText(weekday.charAt(0).toUpperCase() + weekday.slice(1), 190, centerY - 8);

    ctx.fillStyle = COLORS.muted;
    ctx.font = "normal 28px system-ui, -apple-system, sans-serif";
    ctx.fillText(format(day, "dd 'de' MMMM", { locale: ptBR }), 190, centerY + 32);
  });

  const footerY = height - footerHeight;
  const footerGrad = ctx.createLinearGradient(0, footerY, width, height);
  footerGrad.addColorStop(0, COLORS.teal);
  footerGrad.addColorStop(0.55, COLORS.blue);
  footerGrad.addColorStop(1, COLORS.lilac);
  ctx.fillStyle = footerGrad;
  ctx.fillRect(0, footerY, width, footerHeight);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.font = "500 30px system-ui, -apple-system, sans-serif";
  ctx.fillText("Fale comigo para garantir sua data 💬", width / 2, footerY + footerHeight / 2);

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
