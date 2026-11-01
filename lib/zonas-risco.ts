// Zonas anatômicas de risco (e-book do HIPRO, cap. 21 e protocolos 13 a 18):
// um aviso curto e fixo em cada área do Planejador (cartão da área e foto
// ampliada). Só informa, não bloqueia nada e não mexe nos números do dono.
// Regra pura, testada em zonas-risco.test.ts.

import type { Area } from "./planejador";

export const AVISO_GERAL_APLICACAO = "Gel em toda a área, aplicador a 90° e sempre em movimento; disparo teste antes de começar.";

const NERVO_MARGINAL = "Nervo marginal da mandíbula: faixa de 2 cm a partir da comissura labial; ali não usar 2,0 a 4,5 mm (só 1,5 mm se estritamente indicado).";
const CERVICAL = "Não disparar abaixo do osso hioide nem sobre a faixa central do pescoço (traqueia, tireoide); tratar só as bandas laterais.";
const OLHOS = "Só sobre o rebordo ósseo orbitário; nunca na cavidade orbitária nem sobre o globo ocular. Linha média pupilar marca o forame supraorbital (1,0 a 1,5 cm acima do rebordo). Energia 0,5 a 1,5 J.";
const FRONTAL = "Forame supraorbital na linha média pupilar: manter 1,0 a 1,5 cm acima do rebordo.";
const PERIORAL = "Proteção dentária: gaze intraoral sobre incisivos e caninos.";
const TEMPORAL = "Ramo temporal do nervo facial sobre o arco zigomático: evitar pressão e energia altas.";
const OSSO = "Não aplicar sobre saliências ósseas sem coxim de gordura (patela, crista ilíaca).";
const COLUNA = "Manter 3 cm da coluna vertebral.";
const SULCO = "Deixar 3 a 4 dedos de margem a partir da metade do glúteo (faixa de sustentação).";

/** Áreas fixas do rosto (ids de AREAS_FIXAS). */
export const ZONA_POR_AREA: Record<string, string> = {
  arcomandibular: NERVO_MARGINAL,
  jowls: NERVO_MARGINAL,
  papada: CERVICAL,
  submandibular: CERVICAL,
  pescoco: CERVICAL,
  olhos: OLHOS,
  frontal: FRONTAL,
  perioral_sup: PERIORAL,
  perioral_inf: PERIORAL,
};

/** Regiões corporais (ids de CATALOGO_CORPORAL, guardados em area.parte). */
export const ZONA_POR_PARTE: Record<string, string> = {
  abdomen: "Manter 2 cm do umbigo.",
  flancos: COLUNA,
  costas: "Gordura do sutiã: não disparar na axila nem sobre as mamas; manter 3 cm da coluna vertebral.",
  bracos: "Cuidado com os linfonodos da axila; marcar só o tríceps, do cotovelo à axila.",
  maos: OSSO,
  gluteos: `Sulco infraglúteo: ${SULCO.charAt(0).toLowerCase()}${SULCO.slice(1)}`,
  culote: OSSO,
  coxa_interna: OSSO,
  coxa_anterior: OSSO,
  coxa_posterior: OSSO,
  joelhos: OSSO,
  panturrilhas: OSSO,
};

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Área manual: pelo nome que o dono escreveu. */
function zonaPeloNome(nome: string): string | null {
  const n = semAcento(nome);
  if (/temporal|tempora|zigomat/.test(n)) return TEMPORAL;
  if (/palpebra|olho|orbit/.test(n)) return OLHOS;
  if (/sulco|infraglut/.test(n)) return SULCO;
  if (/colo|decote/.test(n)) return "Não disparar sobre a região central nem sobre as mamas.";
  if (/sutia/.test(n)) return ZONA_POR_PARTE.costas;
  if (/abdom|barriga|umbigo/.test(n)) return ZONA_POR_PARTE.abdomen;
  if (/flanco|costa|lombar/.test(n)) return COLUNA;
  if (/braco|triceps/.test(n)) return ZONA_POR_PARTE.bracos;
  if (/papada|pescoco|submand|cervical/.test(n)) return CERVICAL;
  if (/frontal|testa/.test(n)) return FRONTAL;
  if (/perioral|labio|boca|mento|queixo/.test(n)) return PERIORAL;
  if (/mandib|jowl|nasolabial|bigode/.test(n)) return NERVO_MARGINAL;
  if (/gluteo/.test(n)) return ZONA_POR_PARTE.gluteos;
  return null;
}

/** Aviso de zona de risco da área (nulo se não há nenhum específico). */
export function zonaDeRisco(a: Pick<Area, "id" | "nome" | "regiao" | "parte" | "manual">): string | null {
  if (!a.manual && ZONA_POR_AREA[a.id]) return ZONA_POR_AREA[a.id];
  if (a.regiao === "corporal") {
    if (a.parte && ZONA_POR_PARTE[a.parte]) return ZONA_POR_PARTE[a.parte];
    return zonaPeloNome(a.nome) ?? OSSO;
  }
  return zonaPeloNome(a.nome);
}

/** Texto curto para uma linha só (o resto em "ver mais"). */
export function resumoDaZona(texto: string, max = 70): { curto: string; cortado: boolean } {
  if (texto.length <= max) return { curto: texto, cortado: false };
  const corte = texto.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return { curto: `${corte.slice(0, espaco > 30 ? espaco : max).replace(/[,;:.]$/, "")}...`, cortado: true };
}
