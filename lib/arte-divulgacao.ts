import { roundedRectPath } from "./availability-image";

// ============================================================
// ARTE PARA A CLIENTE DIVULGAR O DIA DO HIPRO
//
// A cliente posta no status do WhatsApp e no Instagram para encher a agenda
// do dia (mais pacientes = mais disparos = locação maior). Não leva a marca
// da Harmonize: quem divulga é a clínica. Textos editáveis na tela.
// ============================================================

export type FormatoArte = "story" | "feed";

export interface DadosArte {
  titulo: string;
  subtitulo: string;
  dataInicio: string; // YYYY-MM-DD
  dataFim?: string | null;
  local: string;
  cidade: string;
  chamada: string;
  contato: string;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const DIAS = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const FONTE = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

function partes(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return { a, m, d, dia: new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay() };
}

/** "20 de outubro" / "20 a 22 de outubro" / "30 de outubro a 1º de novembro". */
export function textoDataArte(inicio: string, fim?: string | null): { linha1: string; linha2: string } {
  const i = partes(inicio);
  const diaNum = (d: number) => (d === 1 ? "1º" : String(d));
  if (!fim || fim <= inicio) return { linha1: DIAS[i.dia], linha2: `${diaNum(i.d)} de ${MESES[i.m - 1]}` };
  const f = partes(fim);
  const linha1 = `${DIAS[i.dia]} a ${DIAS[f.dia]}`;
  if (i.m === f.m && i.a === f.a) return { linha1, linha2: `${diaNum(i.d)} a ${diaNum(f.d)} de ${MESES[i.m - 1]}` };
  return { linha1, linha2: `${diaNum(i.d)}/${String(i.m).padStart(2, "0")} a ${diaNum(f.d)}/${String(f.m).padStart(2, "0")}` };
}

/** "(83) 99999-9999" a partir de qualquer formato; vazio se não der. */
export function telefoneArte(tel: string | null | undefined): string {
  let d = (tel ?? "").replace(/\D/g, "");
  if (d.startsWith("55") && d.length > 11) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel?.trim() ?? "";
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

/** Escreve centralizado, diminuindo a fonte até caber em maxLinhas. Devolve a altura usada. */
function escrever(
  ctx: CanvasRenderingContext2D,
  texto: string,
  y: number,
  o: { tamanho: number; peso: number; cor: string; largura: number; maxLinhas: number; cx: number; espaco?: number }
): number {
  if (!texto.trim()) return 0;
  let tam = o.tamanho;
  let linhas: string[] = [];
  for (; tam > 20; tam -= 4) {
    ctx.font = `${o.peso} ${tam}px ${FONTE}`;
    linhas = quebrar(ctx, texto, o.largura);
    if (linhas.length <= o.maxLinhas && linhas.every((l) => ctx.measureText(l).width <= o.largura)) break;
  }
  ctx.fillStyle = o.cor;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const alturaLinha = tam * 1.15;
  if (o.espaco) (ctx as any).letterSpacing = `${o.espaco}px`;
  linhas.forEach((l, i) => ctx.fillText(l, o.cx, y + i * alturaLinha));
  if (o.espaco) (ctx as any).letterSpacing = "0px";
  return linhas.length * alturaLinha;
}

export function drawArteDivulgacao(d: DadosArte, formato: FormatoArte): HTMLCanvasElement {
  const W = 1080;
  const H = formato === "story" ? 1920 : 1350;
  const k = formato === "story" ? 1 : 1.1; // encolhe espaços no feed
  const f = formato === "story" ? 1 : 0.8; // e as letras
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const cx = W / 2;
  const larg = W - 160;

  // Fundo: degradê azul-petróleo com dois círculos suaves.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#0d3b3a");
  g.addColorStop(0.55, "#1f6f6b");
  g.addColorStop(1, "#2e9a94");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.beginPath();
  ctx.arc(W - 60, 120, 320, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(80, H - 140, 260, 0, Math.PI * 2);
  ctx.fill();

  let y = formato === "story" ? 230 : 120;
  y += escrever(ctx, "AGENDA ABERTA", y, { tamanho: 38 * f, peso: 600, cor: "rgba(255,255,255,0.75)", largura: larg, maxLinhas: 1, cx, espaco: 10 });
  y += 40 * k;
  y += escrever(ctx, d.titulo, y, { tamanho: 150 * f, peso: 800, cor: "#ffffff", largura: larg, maxLinhas: 2, cx });
  y += 24 * k;
  y += escrever(ctx, d.subtitulo, y, { tamanho: 52 * f, peso: 400, cor: "rgba(255,255,255,0.9)", largura: larg, maxLinhas: 2, cx });
  y += 70 * k;

  // Cartão da data.
  const data = textoDataArte(d.dataInicio, d.dataFim);
  const altCartao = 250 * f;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.25)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = "#ffffff";
  roundedRectPath(ctx, 90, y, W - 180, altCartao, 44);
  ctx.fill();
  ctx.restore();
  const yTexto = y + altCartao * 0.17;
  const h1 = escrever(ctx, data.linha1.toUpperCase(), yTexto, { tamanho: 38 * f, peso: 600, cor: "#2e9a94", largura: W - 260, maxLinhas: 1, cx, espaco: 4 });
  escrever(ctx, data.linha2, yTexto + h1 + 14, { tamanho: 96 * f, peso: 800, cor: "#0d3b3a", largura: W - 260, maxLinhas: 1, cx });
  y += altCartao + 70 * k;

  // Onde.
  y += escrever(ctx, d.local, y, { tamanho: 64 * f, peso: 700, cor: "#ffffff", largura: larg, maxLinhas: 2, cx });
  y += 10;
  y += escrever(ctx, d.cidade, y, { tamanho: 46 * f, peso: 400, cor: "rgba(255,255,255,0.85)", largura: larg, maxLinhas: 1, cx });

  // Rodapé: chamada e contato, presos embaixo.
  const temContato = !!d.contato.trim();
  const altPilula = 120 * f;
  const base = H - (formato === "story" ? 230 : 100);
  let yRodape = base - (temContato ? altPilula : 0);
  ctx.font = `600 ${50 * f}px ${FONTE}`;
  const linhasChamada = quebrar(ctx, d.chamada, larg).length || 0;
  yRodape -= linhasChamada * 50 * f * 1.15 + (temContato ? 36 : 0);
  if (yRodape < y + 40) yRodape = y + 40;
  yRodape += escrever(ctx, d.chamada, yRodape, { tamanho: 50 * f, peso: 600, cor: "#ffffff", largura: larg, maxLinhas: 2, cx });
  if (temContato) {
    yRodape += 36;
    ctx.font = `700 ${54 * f}px ${FONTE}`;
    const texto = `WhatsApp ${d.contato}`;
    const wPil = Math.min(W - 160, ctx.measureText(texto).width + 120);
    ctx.fillStyle = "#25d366";
    roundedRectPath(ctx, cx - wPil / 2, yRodape, wPil, altPilula, altPilula / 2);
    ctx.fill();
    escrever(ctx, texto, yRodape + (altPilula - 54 * f * 1.15) / 2 + 4, { tamanho: 54 * f, peso: 700, cor: "#ffffff", largura: wPil - 80, maxLinhas: 1, cx });
  }
  return canvas;
}
