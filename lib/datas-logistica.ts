// Melhores datas por logística (pedido do dono, 26/10/2026): no menu ⋮ de cada
// cartão de lead/cliente, as datas livres do mês separadas pela distância da
// cidade da pessoa até onde o Eder vai estar no dia anterior ou no seguinte.
// Dia livre e "onde ele vai estar" seguem exatamente o Encaixe
// (ehDiaLivre, vizinhosDoDia em lib/encaixe.ts); distância em linha reta pelo
// mapa de Configurações > Cidades (lista fixa de reserva).

import { coordenadasDaCidade, distanciaKm, normalizarCidade, type MapaCidades } from "./cidades-coordenadas";
import { ehDiaLivre, vizinhosDoDia, type EventoComCidade } from "./encaixe";
import { primeiroDiaDoMes, somarDias, ultimoDiaDoMes } from "./period";

export type GrupoLogistica = "perto" | "medio" | "longe" | "sem";

export const ORDEM_GRUPOS: GrupoLogistica[] = ["perto", "medio", "longe", "sem"];

export const TITULO_GRUPO: Record<GrupoLogistica, string> = {
  perto: "Perto",
  medio: "Mais ou menos",
  longe: "Longe",
  sem: "Sem referência",
};

/** Uma cidade onde ele vai estar ao redor do dia, com a distância até a pessoa. */
export interface Referencia {
  cidade: string;
  /** Dias (anterior e/ou seguinte) em que ele atende nessa cidade. */
  dias: string[];
  km: number;
}

export interface DataLogistica {
  data: string;
  grupo: GrupoLogistica;
  /** A referência mais próxima da pessoa (nula no grupo "sem"). */
  referencia: Referencia | null;
  /** As outras referências medidas, da mais perto para a mais longe. */
  outras: Referencia[];
  /** Por que não deu para medir (só no grupo "sem"). */
  motivo: string | null;
  /** Cidades ao redor em texto, para ele julgar (grupo "sem"). */
  cidadesAoRedor: string[];
}

const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function diaDaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** "qua 12/11". */
export function rotuloData(iso: string): string {
  return `${SEMANA[diaDaSemana(iso)]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "novembro" (aceita "2026-11" ou qualquer data do mês). */
export function nomeDoMes(mes: string): string {
  return MESES[Number(mes.slice(5, 7)) - 1] ?? "";
}

/** Mês padrão ao abrir: o seguinte se hoje já passou do dia 20, senão o atual ("AAAA-MM"). */
export function mesPadrao(hoje: string): string {
  if (Number(hoje.slice(8, 10)) > 20) return somarDias(ultimoDiaDoMes(hoje), 1).slice(0, 7);
  return hoje.slice(0, 7);
}

/** Soma (ou subtrai) meses a "AAAA-MM". */
export function somarMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Período a carregar da agenda para o mês: um dia antes e um depois (vizinhos da virada). */
export function periodoDoMes(mes: string): { de: string; ate: string } {
  const primeiro = primeiroDiaDoMes(`${mes}-01`);
  return { de: somarDias(primeiro, -1), ate: somarDias(ultimoDiaDoMes(primeiro), 1) };
}

/** Faixa da distância: até `pertoKm` é Perto, até `raioKm` Mais ou menos, acima Longe (fronteiras entram no grupo de baixo). */
export function grupoDaDistancia(km: number, pertoKm: number, raioKm: number): Exclude<GrupoLogistica, "sem"> {
  if (km <= pertoKm) return "perto";
  if (km <= raioKm) return "medio";
  return "longe";
}

function semRepetir(nomes: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const n of nomes) {
    const k = normalizarCidade(n);
    if (!k || vistos.has(k)) continue;
    vistos.add(k);
    saida.push(n.trim());
  }
  return saida;
}

/**
 * Datas livres do mês (a partir de amanhã), classificadas e já na ordem da
 * tela: grupo (Perto, Mais ou menos, Longe, Sem referência), distância e data.
 */
export function melhoresDatas(params: {
  mes: string;
  hoje: string;
  ocupados: Set<string>;
  eventos: EventoComCidade[];
  cidadePessoa: string | null | undefined;
  pertoKm: number;
  raioKm: number;
  mapa?: Readonly<MapaCidades>;
}): DataLogistica[] {
  const { mes, hoje, ocupados, eventos, cidadePessoa, pertoKm, raioKm, mapa } = params;
  const primeiro = primeiroDiaDoMes(`${mes}-01`);
  const ultimo = ultimoDiaDoMes(primeiro);
  const temCidade = !!(cidadePessoa && cidadePessoa.trim());
  const posPessoa = temCidade ? coordenadasDaCidade(cidadePessoa, mapa) : null;

  const lista: DataLogistica[] = [];
  for (let dia = primeiro; dia <= ultimo; dia = somarDias(dia, 1)) {
    if (!ehDiaLivre(dia, hoje, ocupados)) continue;
    const vizinhos = vizinhosDoDia(dia, eventos);
    const cidadesAoRedor = semRepetir(vizinhos.flatMap((v) => (v.cidade && v.cidade.trim() ? [v.cidade] : [])));
    const base = { data: dia, referencia: null, outras: [], cidadesAoRedor };

    if (vizinhos.length === 0) {
      lista.push({ ...base, grupo: "sem", motivo: "Nenhum atendimento no dia anterior nem no seguinte: logística livre." });
      continue;
    }
    if (!temCidade) {
      lista.push({ ...base, grupo: "sem", motivo: "Sem cidade no cadastro dela: não dá para medir." });
      continue;
    }
    if (!posPessoa) {
      lista.push({ ...base, grupo: "sem", motivo: `${cidadePessoa!.trim()} não está em Configurações > Cidades.` });
      continue;
    }

    // Referências medidas, uma por cidade (os dias em que ele atende nela).
    const porCidade = new Map<string, Referencia>();
    for (const v of vizinhos) {
      if (!v.cidade) continue;
      const pos = coordenadasDaCidade(v.cidade, mapa);
      if (!pos) continue;
      const k = normalizarCidade(v.cidade);
      const r = porCidade.get(k);
      if (r) {
        if (!r.dias.includes(v.dia)) r.dias.push(v.dia);
      } else porCidade.set(k, { cidade: v.cidade.trim(), dias: [v.dia], km: distanciaKm(posPessoa, pos) });
    }
    const refs = [...porCidade.values()].map((r) => ({ ...r, dias: [...r.dias].sort() })).sort((a, b) => a.km - b.km || a.dias[0].localeCompare(b.dias[0]));
    if (refs.length === 0) {
      const motivo = cidadesAoRedor.length
        ? `Atendimento ao redor em cidade fora de Configurações > Cidades.`
        : "Atendimento ao redor sem cidade no cadastro da cliente.";
      lista.push({ ...base, grupo: "sem", motivo });
      continue;
    }
    lista.push({
      data: dia,
      grupo: grupoDaDistancia(refs[0].km, pertoKm, raioKm),
      referencia: refs[0],
      outras: refs.slice(1),
      motivo: null,
      cidadesAoRedor,
    });
  }

  const ordem = (g: GrupoLogistica) => ORDEM_GRUPOS.indexOf(g);
  return lista.sort(
    (a, b) =>
      ordem(a.grupo) - ordem(b.grupo) ||
      (a.referencia?.km ?? 0) - (b.referencia?.km ?? 0) ||
      a.data.localeCompare(b.data)
  );
}

/** "no dia 11" / "nos dias 11 e 13". */
export function textoDias(r: Referencia): string {
  const dias = r.dias.map((d) => String(Number(d.slice(8, 10))));
  return dias.length > 1 ? `nos dias ${juntar(dias)}` : `no dia ${dias[0] ?? ""}`;
}

/** "atendo em Caruaru no dia 11" / "atendo em Caruaru nos dias 11 e 13". */
export function textoReferencia(r: Referencia): string {
  return `atendo em ${r.cidade} ${textoDias(r)}`;
}

/** "a", "a e b", "a, b e c". */
export function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} e ${itens[itens.length - 1]}`;
}

/** Texto do "Copiar datas": "qua 12/11, sex 14/11 e sáb 15/11", sempre em ordem de data. */
export function textoDatas(datas: string[]): string {
  return juntar([...new Set(datas)].sort().map(rotuloData));
}

/** Mensagem do WhatsApp com as datas escolhidas (frase fixa, saudação da pessoa). */
export function mensagemMelhoresDatas(saudacao: string, mes: string, datas: string[]): string {
  const lista = textoDatas(datas);
  const unicas = new Set(datas).size;
  const frase =
    unicas === 1
      ? `Tenho esta data livre em ${nomeDoMes(mes)}: ${lista}. Funciona para você?`
      : `Tenho estas datas livres em ${nomeDoMes(mes)}: ${lista}. Qual funciona melhor para você?`;
  return `${saudacao}\n\n${frase}`;
}

// ---------- Termômetro (pedido do dono, 26/10/2026) ----------
// Escala linear de 0 até um teto visual de 2x o raio: Perto (0 a pertoKm),
// Mais ou menos (pertoKm a raioKm) e Longe (raioKm ao teto).

function faixaValida(pertoKm: number, raioKm: number): boolean {
  return Number.isFinite(pertoKm) && Number.isFinite(raioKm) && raioKm > 0 && pertoKm >= 0 && pertoKm <= raioKm;
}

/** Posição (0 a 1) da distância na escala do termômetro; acima do teto fica em 1. null se inválido. */
export function posicaoNaEscala(km: number, pertoKm: number, raioKm: number): number | null {
  if (!Number.isFinite(km) || km < 0 || !faixaValida(pertoKm, raioKm)) return null;
  return Math.min(1, km / (2 * raioKm));
}

/** Larguras (0 a 1, somam 1) das zonas Perto, Mais ou menos e Longe na escala. */
export function larguraDasZonas(pertoKm: number, raioKm: number): { perto: number; medio: number; longe: number } {
  if (!faixaValida(pertoKm, raioKm)) return { perto: 0, medio: 0, longe: 1 };
  const teto = 2 * raioKm;
  return { perto: pertoKm / teto, medio: (raioKm - pertoKm) / teto, longe: 0.5 };
}

export const PROXIMIDADE_MINIMA = 0.05;

/**
 * Preenchimento da mini barra: cheia (1) na mesma cidade, quase vazia
 * (PROXIMIDADE_MINIMA) no teto ou além. Valor inválido = 0 (barra vazia).
 */
export function proximidade(km: number, pertoKm: number, raioKm: number): number {
  const pos = posicaoNaEscala(km, pertoKm, raioKm);
  if (pos === null) return 0;
  return Math.max(PROXIMIDADE_MINIMA, 1 - pos);
}

/**
 * Marcadores do termômetro, um por data medida, na ordem da posição. Datas
 * próximas demais (menos que `folga` da escala) sobem um nível para não se sobrepor.
 */
export function marcadoresDoTermometro(
  datas: DataLogistica[],
  pertoKm: number,
  raioKm: number,
  folga = 0.035
): { data: string; grupo: GrupoLogistica; posicao: number; nivel: number }[] {
  const itens = datas
    .flatMap((d) => {
      if (!d.referencia) return [];
      const posicao = posicaoNaEscala(d.referencia.km, pertoKm, raioKm);
      return posicao === null ? [] : [{ data: d.data, grupo: d.grupo, posicao }];
    })
    .sort((a, b) => a.posicao - b.posicao || a.data.localeCompare(b.data));
  // Último marcador em cada nível; entra no primeiro nível onde cabe.
  const ultimos: number[] = [];
  return itens.map((it) => {
    let nivel = ultimos.findIndex((p) => it.posicao - p >= folga);
    if (nivel === -1) nivel = ultimos.length;
    ultimos[nivel] = it.posicao;
    return { ...it, nivel };
  });
}
