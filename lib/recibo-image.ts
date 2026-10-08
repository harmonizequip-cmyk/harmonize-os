import { roundedRectPath } from "./availability-image";

// ============================================================
// IMAGEM DO RECIBO DE PAGAMENTO
//
// Sai logo depois de registrar um pagamento ("Enviar recibo"), para mandar à
// cliente pelo WhatsApp: quanto pagou, quando, como, e quanto ainda falta.
// Mesmo estilo da imagem do cálculo (cartões claros, azul-petróleo).
// ============================================================

export interface DadosRecibo {
  cliente: string | null;
  equipamento: string | null;
  periodo: string; // "10/10/2026" ou "10/10/2026 a 12/10/2026"
  valorPago: number;
  forma: string; // rótulo: PIX, Dinheiro...
  dataPagamento: string; // YYYY-MM-DD
  totalLocacao: number;
  totalPago: number;
  saldo: number;
}

const COR = {
  fundo: "#ffffff",
  tinta: "#1f2937",
  suave: "#6b7280",
  cinzaCard: "#f3f4f6",
  teal: "#2e9a94",
  tealClaro: "#e9f8f7",
  tealBorda: "#b9e6e3",
  ouro: "#b8860b",
};
const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const LARGURA = 420;
const MARGEM = 20;
const ESCALA = 2;

export function reaisRecibo(n: number): string {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function carregarLogo(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = "/harmonize-logo-full.png";
  });
}

export async function drawReciboImage(d: DadosRecibo): Promise<HTMLCanvasElement> {
  const logo = await carregarLogo();
  const altoLogo = logo ? 56 : 0;
  const altura = 24 + (logo ? altoLogo + 16 : 0) + 78 + 130 + 3 * 60 + 50;

  const canvas = document.createElement("canvas");
  canvas.width = LARGURA * ESCALA;
  canvas.height = altura * ESCALA;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = COR.fundo;
  ctx.fillRect(0, 0, LARGURA, altura);
  const util = LARGURA - MARGEM * 2;

  let y = 24;
  if (logo) {
    const w = Math.min(200, (logo.width / logo.height) * altoLogo);
    ctx.drawImage(logo, (LARGURA - w) / 2, y, w, altoLogo);
    y += altoLogo + 16;
  }

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = COR.teal;
  ctx.font = `700 12px ${FONTE}`;
  ctx.fillText("RECIBO DE PAGAMENTO", MARGEM, y + 12);
  y += 36;
  ctx.fillStyle = COR.tinta;
  // Nome comprido: diminui a letra até caber na largura.
  const nome = d.cliente ?? "Cliente";
  let tamanho = 20;
  ctx.font = `700 ${tamanho}px ${FONTE}`;
  while (tamanho > 13 && ctx.measureText(nome).width > util) {
    tamanho -= 1;
    ctx.font = `700 ${tamanho}px ${FONTE}`;
  }
  ctx.fillText(nome, MARGEM, y, util);
  y += 20;
  ctx.fillStyle = COR.suave;
  ctx.font = `500 13px ${FONTE}`;
  ctx.fillText(`${d.equipamento ? d.equipamento + " · " : ""}Locação de ${d.periodo}`, MARGEM, y);
  y += 22;

  // Cartão principal: valor recebido.
  roundedRectPath(ctx, MARGEM, y, util, 112, 16);
  ctx.fillStyle = COR.tealClaro;
  ctx.fill();
  ctx.strokeStyle = COR.tealBorda;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = COR.teal;
  ctx.font = `600 13px ${FONTE}`;
  ctx.fillText("Valor recebido", MARGEM + 16, y + 28);
  ctx.font = `800 32px ${FONTE}`;
  ctx.fillText(reaisRecibo(d.valorPago), MARGEM + 16, y + 68);
  ctx.fillStyle = COR.suave;
  ctx.font = `500 13px ${FONTE}`;
  ctx.fillText(`${d.forma} · ${dataBr(d.dataPagamento)}`, MARGEM + 16, y + 94);
  y += 130;

  const linha = (rotulo: string, valor: string, cor = COR.tinta) => {
    roundedRectPath(ctx, MARGEM, y, util, 48, 14);
    ctx.fillStyle = COR.cinzaCard;
    ctx.fill();
    ctx.fillStyle = COR.suave;
    ctx.font = `500 14px ${FONTE}`;
    ctx.textAlign = "left";
    ctx.fillText(rotulo, MARGEM + 16, y + 30);
    ctx.fillStyle = cor;
    ctx.font = `700 18px ${FONTE}`;
    ctx.textAlign = "right";
    ctx.fillText(valor, MARGEM + util - 16, y + 31);
    ctx.textAlign = "left";
    y += 60;
  };
  linha("Valor da locação", reaisRecibo(d.totalLocacao));
  linha("Total já pago", reaisRecibo(d.totalPago));
  linha(d.saldo > 0.009 ? "Saldo em aberto" : "Situação", d.saldo > 0.009 ? reaisRecibo(d.saldo) : "Quitado ✓", d.saldo > 0.009 ? COR.ouro : COR.teal);

  y += 10;
  ctx.fillStyle = COR.suave;
  ctx.font = `500 12px ${FONTE}`;
  ctx.textAlign = "center";
  ctx.fillText("Obrigado pela confiança! Harmonize · Locação de equipamentos", LARGURA / 2, y + 16);
  return canvas;
}
