// Posição aproximada (latitude, longitude) das cidades onde a Harmonize atende,
// para o encaixe de datas livres saber quem está perto. Distância em linha reta
// (grátis, sem serviço de mapa); a estrada costuma dar uns 20% a 30% a mais.
// Desde 24/10/2026 a lista mora na tabela cidades_coordenadas (Configurações >
// Cidades; carga em lib/carregar-cidades.ts). Esta lista fixa é a reserva
// quando a tabela não pode ser lida e o padrão das funções sem mapa.

/** Nome normalizado (normalizarCidade) → [latitude, longitude]. */
export type MapaCidades = Record<string, [number, number]>;

const CIDADES: MapaCidades = {
  // Pernambuco
  recife: [-8.0476, -34.877],
  olinda: [-8.0089, -34.8553],
  paulista: [-7.9408, -34.8728],
  "jaboatao dos guararapes": [-8.1128, -35.0147],
  jaboatao: [-8.1128, -35.0147],
  camaragibe: [-8.0236, -34.9814],
  "sao lourenco da mata": [-8.0022, -35.0181],
  moreno: [-8.1186, -35.0922],
  "abreu e lima": [-7.9008, -34.8986],
  igarassu: [-7.8342, -34.9064],
  itamaraca: [-7.7478, -34.8256],
  "ilha de itamaraca": [-7.7478, -34.8256],
  "cabo de santo agostinho": [-8.2836, -35.0353],
  ipojuca: [-8.3986, -35.0639],
  "porto de galinhas": [-8.5039, -35.0047],
  escada: [-8.3592, -35.2236],
  sirinhaem: [-8.5908, -35.1161],
  tamandare: [-8.76, -35.1047],
  palmares: [-8.6833, -35.5917],
  "vitoria de santo antao": [-8.1181, -35.2914],
  gravata: [-8.2011, -35.5647],
  bezerros: [-8.2333, -35.7967],
  caruaru: [-8.2836, -35.9761],
  bonito: [-8.4703, -35.7286],
  "bom jardim": [-7.7961, -35.5872],
  limoeiro: [-7.8742, -35.45],
  carpina: [-7.8508, -35.2544],
  surubim: [-7.8331, -35.7547],
  goiana: [-7.5606, -35.0025],
  timbauba: [-7.505, -35.3183],
  "santa cruz do capibaribe": [-7.9572, -36.2047],
  toritama: [-8.0067, -36.0567],
  "belo jardim": [-8.3356, -36.4242],
  pesqueira: [-8.3578, -36.6964],
  garanhuns: [-8.8828, -36.4969],
  arcoverde: [-8.4189, -37.0539],
  "serra talhada": [-7.9858, -38.2958],
  "sao jose do egito": [-7.4789, -37.2742],
  petrolina: [-9.3986, -40.5008],
  // Paraíba
  "joao pessoa": [-7.1153, -34.861],
  cabedelo: [-6.9811, -34.8339],
  bayeux: [-7.125, -34.9322],
  "santa rita": [-7.1139, -34.9781],
  conde: [-7.2597, -34.9075],
  mamanguape: [-6.8386, -35.1261],
  sape: [-7.0936, -35.2333],
  itabaiana: [-7.3286, -35.3322],
  guarabira: [-6.8547, -35.49],
  "campina grande": [-7.2306, -35.8811],
  remigio: [-6.9497, -35.8017],
  esperanca: [-7.0225, -35.8597],
  areia: [-6.9628, -35.6919],
  queimadas: [-7.3583, -35.8981],
  monteiro: [-7.8894, -37.12],
  patos: [-7.0244, -37.28],
  pombal: [-6.7703, -37.8017],
  sousa: [-6.7592, -38.2311],
  cajazeiras: [-6.89, -38.5569],
  // Alagoas
  maceio: [-9.6658, -35.735],
  arapiraca: [-9.7525, -36.6611],
  penedo: [-10.29, -36.5858],
  // Rio Grande do Norte
  natal: [-5.7945, -35.211],
  parnamirim: [-5.9156, -35.2628],
  mossoro: [-5.1875, -37.3442],
  // Outras capitais
  aracaju: [-10.9472, -37.0731],
  fortaleza: [-3.7319, -38.5267],
  salvador: [-12.9714, -38.5014],
  "sao paulo": [-23.5505, -46.6333],
};

/** "JOÃO PESSOA - PB" → "joao pessoa". */
export function normalizarCidade(nome: string | null | undefined): string {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s*[-/,(].*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Lista fixa de sempre (reserva). */
export const CIDADES_PADRAO: Readonly<MapaCidades> = CIDADES;

/** Posição da cidade no mapa dado (sem mapa, a lista fixa de sempre). */
export function coordenadasDaCidade(nome: string | null | undefined, mapa: Readonly<MapaCidades> = CIDADES): [number, number] | null {
  const n = normalizarCidade(nome);
  return n && Object.prototype.hasOwnProperty.call(mapa, n) ? mapa[n] : null;
}

/**
 * Lê "-7.1153, -34.861" (ou com ponto e vírgula, espaço, ou vírgula decimal
 * como "-7,1153 -34,861") em [latitude, longitude]. null se não der.
 */
export function lerCoordenadas(texto: string): [number, number] | null {
  const t = texto.trim();
  if (!t) return null;
  let partes: string[];
  if (t.includes(";")) partes = t.split(";");
  else if (t.includes(".")) partes = t.split(/[,\s]+/); // "-7.1153, -34.861" (Google Maps)
  else partes = t.split(/,?\s+/); // vírgula decimal: "-7,1153 -34,861" ou "-7,1153, -34,861"
  partes = partes.map((p) => p.trim()).filter(Boolean);
  if (partes.length !== 2) return null;
  const [la, lo] = partes.map((p) => Number(p.replace(",", ".")));
  if (!Number.isFinite(la) || !Number.isFinite(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180) return null;
  return [la, lo];
}

/** Distância em linha reta, em km. */
export function distanciaKm(a: [number, number], b: [number, number]): number {
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
