// Modelo corporal em foto (tabela de protocolos do dono, 16/10/2026): as
// regiões são elipses no espaço da foto (114 x 213, frente, do pescoço ao
// joelho). Costas, glúteos, coxa posterior e panturrilhas não aparecem nesta
// foto: seguem no desenho (svgBoneco) até chegar uma foto de costas.

import { svgBoneco } from "./boneco-corporal";
import { FOTO_CORPO } from "./corpo-foto-dados";

export const FOTO_LARGURA = 114;
export const FOTO_ALTURA = 213;

/** [cx, cy, rx, ry, rotação em graus] */
export type Elipse = [number, number, number, number, number?];

export const REGIOES_FOTO: Record<string, Elipse[]> = {
  abdomen: [[47, 78, 14, 16]],
  flancos: [
    [22, 78, 4, 12],
    [71, 74, 4, 11],
  ],
  bracos: [
    [17, 42, 5, 19, 4],
    [94, 38, 6, 15, -38],
  ],
  culote: [
    [21, 119, 4.5, 13],
    [80, 117, 4.5, 13],
  ],
  coxa_anterior: [
    [33, 150, 7, 19],
    [66, 150, 7, 19],
  ],
  coxa_interna: [
    [44, 151, 3.5, 14],
    [53, 151, 3.5, 14],
  ],
  joelhos: [
    [38, 198, 7, 7],
    [60, 198, 7, 7],
  ],
};

export const naFoto = (id: string | undefined | null) => !!id && id in REGIOES_FOTO;

const elipseSvg = ([cx, cy, rx, ry, rot]: Elipse, attrs: string) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"${rot ? ` transform="rotate(${rot} ${cx} ${cy})"` : ""} ${attrs}/>`;

/** SVG da foto com as regiões marcadas (para <img> e impressão). */
export function svgCorpoFoto(destacar: string[]): string {
  const marcas = destacar
    .filter(naFoto)
    .flatMap((id) => REGIOES_FOTO[id].map((e) => elipseSvg(e, 'fill="#3DBFB8" fill-opacity="0.5" stroke="#1F8F88" stroke-width="1.2"')))
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${FOTO_LARGURA} ${FOTO_ALTURA}" width="${FOTO_LARGURA * 2}" height="${FOTO_ALTURA * 2}"><defs><clipPath id="q"><rect width="${FOTO_LARGURA}" height="${FOTO_ALTURA}" rx="7"/></clipPath></defs><g clip-path="url(#q)"><rect width="${FOTO_LARGURA}" height="${FOTO_ALTURA}" fill="#fff"/><image href="${FOTO_CORPO}" xlink:href="${FOTO_CORPO}" x="0" y="0" width="${FOTO_LARGURA}" height="${FOTO_ALTURA}"/>${marcas}</g></svg>`;
}

/** Imagem de uma área corporal: na foto quando a região aparece nela; senão o desenho. */
export function urlImagemCorporal(parte?: string | null): string {
  const svg = !parte || naFoto(parte) ? svgCorpoFoto(parte ? [parte] : []) : svgBoneco([parte]);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
