// Encaixe de datas livres (pedido do dono, 23/10/2026): dia livre (os dois
// HIPROs sem evento e sem bloqueio, fora domingo) que tem atendimento no dia
// anterior ou no seguinte vira oportunidade; a cidade das clientes desses
// atendimentos diz onde o Eder vai estar, e entram as clientes e leads até
// RAIO_KM dali, sem reserva marcada. Ordem: quem já está na hora de conversar,
// depois a prioridade do Relacionamento, depois a distância.

import { coordenadasDaCidade, distanciaKm, normalizarCidade, type MapaCidades } from "./cidades-coordenadas";
import { diasDoPeriodo, somarDias } from "./period";
import type { PessoaClassificada } from "./relacionamento";
import { renderizarModelo, type ModelosMensagem } from "./mensagens-modelos";
import { variaveisDaPessoa } from "./saudacao";

export const RAIO_KM = 150;
export const DIAS_A_FRENTE = 30;

export interface EventoComCidade {
  data: string;
  ate: string | null;
  cidade: string | null;
}

export interface Ancora {
  dia: string;
  cidade: string;
}

export interface Candidata {
  pessoa: PessoaClassificada;
  km: number;
  /** Cidade de referência (onde ele vai estar) mais perto dela. */
  perto: string;
}

export interface Oportunidade {
  data: string;
  ancoras: Ancora[];
  candidatas: Candidata[];
}

function cobre(e: EventoComCidade, dia: string) {
  return e.data <= dia && (e.ate && e.ate > e.data ? e.ate : e.data) >= dia;
}

/**
 * Atendimentos do dia anterior e do seguinte (nesta ordem), com a cidade da
 * cliente como está no cadastro (pode vir nula). Base de `ancorasDoDia` e das
 * Melhores datas (lib/datas-logistica.ts), que também precisa saber de
 * atendimento sem cidade ou com cidade fora do mapa.
 */
export function vizinhosDoDia(dia: string, eventos: EventoComCidade[]): { dia: string; cidade: string | null }[] {
  const lista: { dia: string; cidade: string | null }[] = [];
  for (const vizinho of [somarDias(dia, -1), somarDias(dia, 1)]) {
    for (const e of eventos) if (cobre(e, vizinho)) lista.push({ dia: vizinho, cidade: e.cidade });
  }
  return lista;
}

/**
 * Onde ele vai estar no dia anterior e no seguinte (cidades com posição
 * conhecida). `mapa` = cidades do banco; sem ele, a lista fixa de sempre.
 */
export function ancorasDoDia(dia: string, eventos: EventoComCidade[], mapa?: Readonly<MapaCidades>): Ancora[] {
  const vistas = new Set<string>();
  const ancoras: Ancora[] = [];
  for (const v of vizinhosDoDia(dia, eventos)) {
    if (!v.cidade || !coordenadasDaCidade(v.cidade, mapa)) continue;
    const chave = normalizarCidade(v.cidade);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    ancoras.push({ dia: v.dia, cidade: v.cidade.trim() });
  }
  return ancoras;
}

/** Dia livre para o encaixe: depois de hoje, sem HIPRO marcado nem bloqueio, fora domingo. */
export function ehDiaLivre(dia: string, hoje: string, ocupados: Set<string>): boolean {
  return dia > hoje && !ocupados.has(dia) && new Date(`${dia}T12:00:00`).getDay() !== 0;
}

/**
 * Linhas cruas da agenda (calendar_events com clients(city), já sem cancelada e
 * sem teste) e dos bloqueios em: dias ocupados (HIPRO marcado ou bloqueado) e
 * atendimentos com a cidade da cliente. Eventos que terminam antes de `de` ficam fora.
 */
export function agendaDoEncaixe(
  eventos: { date_start: string; date_end: string | null; event_type: string | null; clients?: unknown }[],
  bloqueios: { data_inicio: string; data_fim: string }[],
  de: string
): { ocupados: Set<string>; comCidade: EventoComCidade[] } {
  const ocupados = new Set<string>();
  const comCidade: EventoComCidade[] = [];
  for (const e of eventos) {
    const fim = e.date_end ?? e.date_start;
    if (fim < de) continue;
    if (e.event_type === "hipro_1" || e.event_type === "hipro_2") for (const d of diasDoPeriodo(e.date_start, fim)) ocupados.add(d);
    const cli = (Array.isArray(e.clients) ? e.clients[0] : e.clients) as { city?: string | null } | null | undefined;
    comCidade.push({ data: e.date_start, ate: e.date_end, cidade: cli?.city ?? null });
  }
  for (const b of bloqueios) for (const d of diasDoPeriodo(b.data_inicio, b.data_fim, 400)) ocupados.add(d);
  return { ocupados, comCidade };
}

export function candidatasPerto(
  ancoras: Ancora[],
  pessoas: PessoaClassificada[],
  raioKm = RAIO_KM,
  mapa?: Readonly<MapaCidades>
): Candidata[] {
  const pontos = ancoras.flatMap((a) => {
    const c = coordenadasDaCidade(a.cidade, mapa);
    return c ? [{ a, c }] : [];
  });
  const lista: Candidata[] = [];
  for (const p of pessoas) {
    if (p.proximaReserva || p.stage === "desqualificado") continue;
    const c = coordenadasDaCidade(p.cidade, mapa);
    if (!c) continue;
    let melhor: Candidata | null = null;
    for (const { a, c: ca } of pontos) {
      const km = distanciaKm(c, ca);
      if (km <= raioKm && (!melhor || km < melhor.km)) melhor = { pessoa: p, km, perto: a.cidade };
    }
    if (melhor) lista.push(melhor);
  }
  return lista.sort(
    (x, y) =>
      Number(y.pessoa.devida) - Number(x.pessoa.devida) ||
      y.pessoa.prioridade - x.pessoa.prioridade ||
      x.km - y.km
  );
}

/**
 * Oportunidades a partir de amanhã até `diasAFrente`. `ocupados` são os dias
 * com HIPRO marcado ou bloqueado; `somenteDia` restringe a uma data.
 */
export function oportunidadesDeEncaixe(params: {
  hoje: string;
  ocupados: Set<string>;
  eventos: EventoComCidade[];
  pessoas: PessoaClassificada[];
  somenteDia?: string | null;
  diasAFrente?: number;
  raioKm?: number;
  /** Cidades do banco (cidades_coordenadas); sem ele, a lista fixa de sempre. */
  mapa?: Readonly<MapaCidades>;
}): Oportunidade[] {
  const { hoje, ocupados, eventos, pessoas, somenteDia, diasAFrente = DIAS_A_FRENTE, raioKm = RAIO_KM, mapa } = params;
  const dias: string[] = [];
  if (somenteDia) dias.push(somenteDia);
  else for (let i = 1; i <= diasAFrente; i++) dias.push(somarDias(hoje, i));
  const lista: Oportunidade[] = [];
  for (const dia of dias) {
    if (!ehDiaLivre(dia, hoje, ocupados)) continue;
    const ancoras = ancorasDoDia(dia, eventos, mapa);
    if (ancoras.length === 0) continue;
    const candidatas = candidatasPerto(ancoras, pessoas, raioKm, mapa);
    if (candidatas.length > 0) lista.push({ data: dia, ancoras, candidatas });
  }
  return lista;
}

/**
 * Mensagem pronta para oferecer a data (tratamento e primeiro nome, como as
 * outras). Texto editável em Configurações > Mensagens (`modelos`).
 */
export function mensagemEncaixe(
  p: { nome: string; treatment: string | null; displayName: string | null },
  data: string,
  cidade: string,
  saudacao: (x: { name?: string | null; treatment?: string | null; displayName?: string | null }) => string,
  modelos?: Partial<ModelosMensagem> | null
): string {
  const d = new Date(`${data}T12:00:00`);
  const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long" });
  const pessoa = { name: p.nome, treatment: p.treatment, displayName: p.displayName };
  return renderizarModelo(
    "encaixe",
    { saudacao: saudacao(pessoa), nome: variaveisDaPessoa(pessoa).nome, data: dia, dia_semana: semana, cidade },
    modelos
  );
}
