// Modelo corporal em foto, frente e costas (enviada pelo dono em 16/10/2026).
// As regiões são elipses no espaço de cada foto (76 x 222, corpo inteiro).

import { FOTO_CORPO_COSTAS, FOTO_CORPO_FRENTE } from "./corpo-foto-dados";

export const FOTO_LARGURA = 76;
export const FOTO_ALTURA = 222;

export type Vista = "frente" | "costas";
/** [cx, cy, rx, ry, rotação em graus] */
export type Elipse = [number, number, number, number, number?];

export const FOTOS: Record<Vista, string> = { frente: FOTO_CORPO_FRENTE, costas: FOTO_CORPO_COSTAS };

export const REGIOES_FOTO: Record<string, Partial<Record<Vista, Elipse[]>>> = {
  abdomen: { frente: [[37, 68, 10, 11]] },
  flancos: {
    frente: [
      [21, 68, 3, 9],
      [55, 68, 3, 9],
    ],
    costas: [
      [19, 72, 3, 9],
      [57, 72, 3, 9],
    ],
  },
  bracos: {
    frente: [
      [11, 40, 3.5, 14],
      [65, 40, 3.5, 14],
    ],
    costas: [
      [12, 40, 3.5, 14],
      [64, 40, 3.5, 14],
    ],
  },
  maos: {
    frente: [
      [10.5, 108.5, 3.6, 10, -15],
      [65.5, 108.5, 3.6, 10, 15],
    ],
    costas: [
      [8.5, 111, 3.3, 9.5, -15],
      [64.5, 111, 3.3, 9.5, 15],
    ],
  },
  costas: { costas: [[38, 58, 16, 5]] },
  gluteos: {
    costas: [
      [29, 95, 9, 11],
      [47, 95, 9, 11],
    ],
  },
  culote: {
    frente: [
      [16, 102, 3.5, 10],
      [60, 102, 3.5, 10],
    ],
    costas: [
      [15, 100, 3, 9],
      [61, 100, 3, 9],
    ],
  },
  coxa_anterior: {
    frente: [
      [25, 122, 6, 15],
      [51, 122, 6, 15],
    ],
  },
  coxa_interna: {
    frente: [
      [33, 120, 2.8, 12],
      [43, 120, 2.8, 12],
    ],
  },
  coxa_posterior: {
    costas: [
      [28, 128, 6, 14],
      [48, 128, 6, 14],
    ],
  },
  joelhos: {
    frente: [
      [27, 150, 5.5, 6],
      [49, 150, 5.5, 6],
    ],
  },
  panturrilhas: {
    costas: [
      [26, 168, 4.5, 11],
      [49, 168, 4.5, 11],
    ],
  },
};

/** Vista em que a região aparece melhor (frente quando aparece nas duas). */
export function vistaDaRegiao(id?: string | null): Vista {
  return id && !REGIOES_FOTO[id]?.frente && REGIOES_FOTO[id]?.costas ? "costas" : "frente";
}

const elipseSvg = ([cx, cy, rx, ry, rot]: Elipse, attrs: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ""} ${attrs}/>`;

/** Quadrado do recorte centrado nas elipses da região (com folga), dentro da foto. */
export function recorteDaRegiao(id: string | null | undefined, vista: Vista): { x: number; y: number; lado: number } {
  const elipses = (id && REGIOES_FOTO[id]?.[vista]) || [];
  if (!elipses.length) return { x: 0, y: (FOTO_ALTURA - FOTO_LARGURA) / 2 - 40, lado: FOTO_LARGURA };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [cx, cy, rx, ry] of elipses) {
    x0 = Math.min(x0, cx - rx);
    x1 = Math.max(x1, cx + rx);
    y0 = Math.min(y0, cy - ry);
    y1 = Math.max(y1, cy + ry);
  }
  const lado = Math.min(FOTO_LARGURA, Math.max(42, Math.max(x1 - x0, y1 - y0) * 1.5));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const x = Math.min(Math.max(cx - lado / 2, 0), FOTO_LARGURA - lado);
  const y = Math.min(Math.max(cy - lado / 2, 0), FOTO_ALTURA - lado);
  return { x: +x.toFixed(1), y: +y.toFixed(1), lado: +lado.toFixed(1) };
}

/** SVG de uma vista com as regiões marcadas (para <img> e impressão). `recortar`: quadrado centrado na região. */
export function svgCorpoFoto(destacar: string[], vista: Vista = "frente", recortar = false): string {
  const foto = FOTOS[vista];
  const marcas = destacar
    .flatMap((id) => REGIOES_FOTO[id]?.[vista] ?? [])
    .map((e) => elipseSvg(e, 'fill="#3DBFB8" fill-opacity="0.5" stroke="#1F8F88" stroke-width="0.9"'))
    .join("");
  const r = recortar ? recorteDaRegiao(destacar[0], vista) : null;
  const vb = r ? `${r.x} ${r.y} ${r.lado} ${r.lado}` : `0 0 ${FOTO_LARGURA} ${FOTO_ALTURA}`;
  const [w, h] = r ? [240, 240] : [FOTO_LARGURA * 3, FOTO_ALTURA * 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${vb}" width="${w}" height="${h}"><rect x="0" y="0" width="${FOTO_LARGURA}" height="${FOTO_ALTURA}" fill="#fff"/><image href="${foto}" xlink:href="${foto}" x="0" y="0" width="${FOTO_LARGURA}" height="${FOTO_ALTURA}"/>${marcas}</svg>`;
}

/** Miniatura de uma área corporal: a foto (frente ou costas) recortada e centrada na região marcada. */
export function urlImagemCorporal(parte?: string | null): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgCorpoFoto(parte ? [parte] : [], vistaDaRegiao(parte), true))}`;
}

/** Corpo inteiro com a região marcada (imagem ampliada). */
export function urlCorpoInteiro(parte?: string | null): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgCorpoFoto(parte ? [parte] : [], vistaDaRegiao(parte), false))}`;
}
