// Fotos dos pacientes do Planejador HIPRO (antes, imediato, 30, 60 e 90 dias).
// Só regras puras, sem navegador nem banco: caminhos no Storage, medidas da
// redução, agrupamento por etapa e área, áreas para escolher e tamanho legível.
// Regra do dono (30/10/2026): o facial não se separa por área (foto sem área =
// "Rosto"); só as áreas corporais do planejamento separam as fotos.

import { normalizarPlano } from "./planejador";
import type { EstadoPlanejador } from "./planejamento";

export type EtapaFoto = "antes" | "imediato" | "d30" | "d60" | "d90";

export const ETAPAS_FOTO: { id: EtapaFoto; rotulo: string }[] = [
  { id: "antes", rotulo: "Antes" },
  { id: "imediato", rotulo: "Imediato" },
  { id: "d30", rotulo: "30 dias" },
  { id: "d60", rotulo: "60 dias" },
  { id: "d90", rotulo: "90 dias" },
];

/** Pasta privada do Storage. */
export const PASTA_FOTOS = "fotos-pacientes";

/** Rótulo da foto sem área (todo o facial fica junto). */
export const AREA_ROSTO = "Rosto";

export function rotuloDaEtapa(etapa: string): string {
  return ETAPAS_FOTO.find((e) => e.id === etapa)?.rotulo ?? etapa;
}

/** Linha da tabela paciente_fotos. */
export interface FotoPaciente {
  id: string;
  paciente_id: string;
  planejamento_id: string | null;
  etapa: EtapaFoto;
  area: string | null;
  caminho: string;
  miniatura: string;
  largura: number | null;
  altura: number | null;
  tamanho_bytes: number | null;
  tirada_em: string;
  observacao: string | null;
  created_at: string;
}

/** Caminhos da foto e da miniatura: p/<paciente>/<etapa>/<id>.jpg e <id>_mini.jpg. */
export function caminhosDaFoto(pacienteId: string, etapa: EtapaFoto, id: string): { caminho: string; miniatura: string } {
  const base = `p/${pacienteId}/${etapa}/${id}`;
  return { caminho: `${base}.jpg`, miniatura: `${base}_mini.jpg` };
}

/** Limita o lado maior a ladoMaximo, sem aumentar foto pequena; arredonda, mínimo 1. */
export function medidasReduzidas(largura: number, altura: number, ladoMaximo: number): { largura: number; altura: number } {
  const l = Math.max(1, Number(largura) || 1);
  const a = Math.max(1, Number(altura) || 1);
  const escala = Math.min(1, ladoMaximo / Math.max(l, a));
  return { largura: Math.max(1, Math.round(l * escala)), altura: Math.max(1, Math.round(a * escala)) };
}

export interface GrupoArea<T> {
  area: string;
  fotos: T[];
}

export interface GrupoEtapa<T> {
  etapa: EtapaFoto;
  rotulo: string;
  total: number;
  areas: GrupoArea<T>[];
}

type FotoOrdenavel = Pick<FotoPaciente, "etapa" | "area" | "tirada_em" | "created_at">;

const ordemFoto = (x: FotoOrdenavel, y: FotoOrdenavel) =>
  (x.tirada_em ?? "").localeCompare(y.tirada_em ?? "") || (x.created_at ?? "").localeCompare(y.created_at ?? "");

/**
 * Por etapa (na ordem de ETAPAS_FOTO, todas presentes, mesmo vazias) e, dentro
 * de cada uma, por área ("Rosto" primeiro, depois em ordem alfabética).
 * Fotos em ordem de data e de envio.
 */
export function agruparFotos<T extends FotoOrdenavel>(fotos: T[]): GrupoEtapa<T>[] {
  return ETAPAS_FOTO.map(({ id, rotulo }) => {
    const daEtapa = fotos.filter((f) => f.etapa === id);
    const porArea = new Map<string, T[]>();
    for (const f of daEtapa) {
      const area = f.area?.trim() || AREA_ROSTO;
      const chave = normalizarArea(area);
      const atual = porArea.get(chave);
      if (atual) atual.push(f);
      else porArea.set(chave, [f]);
    }
    const areas = [...porArea.values()]
      .map((lista) => ({ area: lista[0].area?.trim() || AREA_ROSTO, fotos: [...lista].sort(ordemFoto) }))
      .sort((x, y) => {
        if (x.area === AREA_ROSTO) return -1;
        if (y.area === AREA_ROSTO) return 1;
        return x.area.localeCompare(y.area, "pt-BR");
      });
    return { etapa: id, rotulo, total: daEtapa.length, areas };
  });
}

function normalizarArea(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Rosto" no começo e as áreas corporais sem repetir (ignora acento e maiúscula). */
export function areasParaFoto(nomesDasAreasCorporais: string[]): string[] {
  const vistas = new Set<string>([normalizarArea(AREA_ROSTO)]);
  const lista = [AREA_ROSTO];
  for (const nome of nomesDasAreasCorporais) {
    const limpo = (nome ?? "").replace(/\s+/g, " ").trim();
    if (!limpo) continue;
    const chave = normalizarArea(limpo);
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    lista.push(limpo);
  }
  return lista;
}

/** "850 KB", "12,4 MB", "1,2 GB". */
export function formatarTamanho(bytes: number): string {
  const b = Math.max(0, Number(bytes) || 0);
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const num = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 1 });
  if (b >= GB) return `${num(b / GB)} GB`;
  if (b >= MB) return `${num(b / MB)} MB`;
  return `${Math.round(b / KB).toLocaleString("pt-BR")} KB`;
}

/** Erro de tabela ou função que ainda não existe (SQL das fotos não rodou). */
export function faltaSqlDasFotos(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  if (erro.code === "42P01" || erro.code === "PGRST205" || erro.code === "PGRST202" || erro.code === "42883") return true;
  return /does not exist|could not find the (table|function)/i.test(erro.message ?? "");
}

/**
 * Nomes das áreas corporais (áreas manuais com regiao "corporal") dos
 * planejamentos, da sessão aberta e das anteriores, sem repetir. As áreas
 * fixas do rosto nunca entram.
 */
export function areasCorporaisDosPlanos(estados: (EstadoPlanejador | null | undefined)[]): string[] {
  const nomes: string[] = [];
  const vistas = new Set<string>();
  for (const estado of estados) {
    if (!estado) continue;
    const plano = normalizarPlano(estado);
    const areas = [...plano.customAreas, ...plano.sessoesAnteriores.flatMap((s) => s.customAreas)];
    for (const a of areas) {
      if (a.regiao !== "corporal") continue;
      const nome = (a.nome ?? "").replace(/\s+/g, " ").trim();
      const chave = normalizarArea(nome);
      if (!nome || vistas.has(chave)) continue;
      vistas.add(chave);
      nomes.push(nome);
    }
  }
  return nomes;
}
