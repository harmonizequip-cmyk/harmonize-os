// Boneco corporal (frente e costas, corpo inteiro) com a região da área
// marcada na cor da marca. Usado no seletor de áreas (toque na região) e como
// imagem das áreas corporais no planejador: os arquivos de
// public/ferramentas/corpo/<id>.svg saem de svgBoneco (o teste confere).

export interface RegiaoCorporal {
  id: string;
  nome: string;
  /** Linha com direito e esquerdo no planejador. */
  bilateral: boolean;
  /** Tipo mais comum na área (o usuário troca). */
  tipo: "flacidez" | "gordura";
}

export const CATALOGO_CORPORAL: RegiaoCorporal[] = [
  { id: "abdomen", nome: "Abdômen", bilateral: false, tipo: "gordura" },
  { id: "flancos", nome: "Flancos", bilateral: true, tipo: "gordura" },
  { id: "bracos", nome: "Braços", bilateral: true, tipo: "flacidez" },
  { id: "costas", nome: "Costas (dobra do sutiã)", bilateral: true, tipo: "gordura" },
  { id: "gluteos", nome: "Glúteos", bilateral: true, tipo: "flacidez" },
  { id: "culote", nome: "Culote", bilateral: true, tipo: "gordura" },
  { id: "coxa_interna", nome: "Interno de coxa", bilateral: true, tipo: "flacidez" },
  { id: "coxa_anterior", nome: "Coxa anterior", bilateral: true, tipo: "flacidez" },
  { id: "coxa_posterior", nome: "Coxa posterior", bilateral: true, tipo: "flacidez" },
  { id: "joelhos", nome: "Joelhos", bilateral: true, tipo: "flacidez" },
  { id: "panturrilhas", nome: "Panturrilhas", bilateral: true, tipo: "gordura" },
];

export const urlBoneco = (id: string) => `/ferramentas/corpo/${id}.svg`;

// Corpo desenhado em 100 x 224 (centro x = 50). A figura das costas é a
// mesma, deslocada 100 para a direita.
const espelhar = (d: string) => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${+(100 - Number(x)).toFixed(1)},${y}`);

const BRACO = "M31,39 C25,41 22,48 21,58 C20,70 19,82 17,96 C16,104 15,110 14,116 L19,117 C21,108 23,100 25,92 C27,82 29,72 31,62 Z";
const PERNA = "M31,122 C30,140 32,158 34,172 C35,184 35,196 36,206 L44,206 C44,196 45,184 46,172 C47,158 49,140 50,128 Z";
const CORPO: string[] = [
  "M45,27 h10 v11 h-10 Z",
  "M31,38 C40,34 60,34 69,38 C72,48 71,58 67,66 C65,78 64,88 65,98 C70,106 71,116 69,126 L31,126 C29,116 30,106 35,98 C36,88 35,78 33,66 C29,58 28,48 31,38 Z",
  BRACO,
  espelhar(BRACO),
  PERNA,
  espelhar(PERNA),
];
const ELIPSES_CORPO: [number, number, number, number][] = [
  [50, 16, 10, 12],
  [16, 121, 3.5, 6],
  [84, 121, 3.5, 6],
  [40, 209, 5.5, 3],
  [60, 209, 5.5, 3],
];

type Forma = { d?: string; e?: [number, number, number, number] };
type Vista = "frente" | "costas";
const par = (d: string): Forma[] => [{ d }, { d: espelhar(d) }];
const parE = (cx: number, cy: number, rx: number, ry: number): Forma[] => [{ e: [cx, cy, rx, ry] }, { e: [100 - cx, cy, rx, ry] }];

const FORMAS: Record<string, Partial<Record<Vista, Forma[]>>> = {
  abdomen: { frente: [{ d: "M38,70 C45,67 55,67 62,70 C62,82 62,92 63,103 C56,107 44,107 37,103 C38,92 38,82 38,70 Z" }] },
  flancos: {
    frente: par("M33.5,80 C35.5,86 35.5,93 35,99 L38,100 C38.5,93 38,86 36.5,80 Z"),
    costas: par("M34,84 C36,90 35.5,97 35,104 L42,106 C42,98 41.5,91 40.5,84 Z"),
  },
  bracos: { costas: par("M30,44 C26,47 24,54 23,64 C22,70 22,74 21,80 L27,81 C28,73 29,65 31,56 Z") },
  costas: { costas: [{ d: "M33,56 C44,60 56,60 67,56 L67,68 C56,72 44,72 33,68 Z" }] },
  gluteos: { costas: parE(42, 113, 8, 9.5) },
  culote: {
    frente: par("M31,118 C29.5,124 30,132 31.5,139 L34.5,138 C34,131 34,124 35,118 Z"),
    costas: par("M31,118 C29,124 29.5,132 31,140 L36.5,138 C35.5,130 35.5,124 36.5,118 Z"),
  },
  coxa_interna: { frente: par("M49.3,129 C48.5,140 47.3,153 46.3,165 L42,164 C42.5,152 43.5,140 44.5,130 Z") },
  coxa_anterior: { frente: parE(39.5, 147, 5, 15) },
  coxa_posterior: { costas: parE(40, 145, 5.5, 16) },
  joelhos: { frente: parE(40, 176, 4.8, 4.8) },
  panturrilhas: { costas: parE(39.8, 189, 4, 9) },
};

export interface FormaDesenho {
  d?: string;
  e?: [number, number, number, number];
}

const deslocar = (d: string, dx: number) =>
  dx ? d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, x, y) => `${+(Number(x) + dx).toFixed(1)},${y}`) : d;
const mover = (f: Forma, dx: number): FormaDesenho => (f.e ? { e: [f.e[0] + dx, f.e[1], f.e[2], f.e[3]] } : { d: deslocar(f.d!, dx) });

/** Formas de uma região já posicionadas (frente em x 0..100, costas em 100..200). */
export function formasDaRegiao(id: string): FormaDesenho[] {
  const r = FORMAS[id];
  if (!r) return [];
  return [...(r.frente ?? []).map((f) => mover(f, 0)), ...(r.costas ?? []).map((f) => mover(f, 100))];
}

/** Silhueta das duas figuras (para desenhar por baixo das regiões). */
export function formasDoCorpo(): FormaDesenho[] {
  const uma = (dx: number): FormaDesenho[] => [
    ...CORPO.map((d) => mover({ d }, dx)),
    ...ELIPSES_CORPO.map((e) => mover({ e }, dx)),
  ];
  return [...uma(0), ...uma(100)];
}

export const CORES_BONECO = {
  fundo: "#F3F8F8",
  contorno: "#B9CDCF",
  pele: "#FFFFFF",
  regiao: "#3AABA0",
  regiaoBorda: "#1F7F77",
  texto: "#7A8F92",
};

const forma = (f: FormaDesenho, attrs: string) =>
  f.e ? `<ellipse cx="${f.e[0]}" cy="${f.e[1]}" rx="${f.e[2]}" ry="${f.e[3]}" ${attrs}/>` : `<path d="${f.d}" ${attrs}/>`;

/** SVG quadrado com as duas figuras inteiras e as regiões marcadas. */
export function svgBoneco(destacar: string[]): string {
  const c = CORES_BONECO;
  const corpo = formasDoCorpo();
  const regioes = destacar.flatMap(formasDaRegiao);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 0 224 224" width="224" height="224">`,
    `<rect x="-12" y="0" width="224" height="224" fill="${c.fundo}"/>`,
    `<g fill="${c.contorno}" stroke="${c.contorno}" stroke-width="2.4" stroke-linejoin="round">${corpo.map((f) => forma(f, "")).join("")}</g>`,
    `<g fill="${c.pele}">${corpo.map((f) => forma(f, "")).join("")}</g>`,
    `<path d="M150,44 C150,70 150,96 150,120" stroke="${c.contorno}" stroke-width="1" fill="none"/>`,
    `<g fill="${c.regiao}" fill-opacity="0.6" stroke="${c.regiaoBorda}" stroke-width="1.1" stroke-linejoin="round">${regioes.map((f) => forma(f, "")).join("")}</g>`,
    `<text x="50" y="221" font-family="Arial,sans-serif" font-size="8" text-anchor="middle" fill="${c.texto}">Frente</text>`,
    `<text x="150" y="221" font-family="Arial,sans-serif" font-size="8" text-anchor="middle" fill="${c.texto}">Costas</text>`,
    `</svg>`,
  ].join("");
}
