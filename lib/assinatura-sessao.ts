// Assinatura da sessão do Planejador HIPRO (só o dono, no celular dele):
// o paciente e a profissional assinam com o dedo. Aqui as regras puras
// (testadas em assinatura-sessao.test.ts): o resumo da sessão que é assinado,
// o JSON canônico e o sha256 dele (para avisar quando a sessão mudou depois
// de assinada), o caminho do arquivo e as contas do recorte da imagem.

import { contaDaSessao, planoDaSessao, subtotalLinha, todasAreas, totalArea, type Plano } from "./planejador";

export type PapelAssinatura = "paciente" | "profissional";

export interface LinhaResumo {
  prof: string;
  d?: number;
  e?: number;
  disp?: number;
  quad?: number;
  total: number;
}

export interface AreaResumo {
  id: string;
  nome: string;
  total: number;
  linhas: LinhaResumo[];
}

/** O que é assinado (e guardado em assinaturas_sessao.resumo para mostrar depois). */
export interface ResumoSessao {
  v: 1;
  paciente: string;
  data: string;
  sessao: number;
  sessoes: number;
  procedimento: string;
  profissional: string;
  areas: AreaResumo[];
  total: number;
  pacote: number;
  /** Disparos que ficam para a próxima sessão (na última, o restante, que pode ser negativo). */
  saldo: number;
}

export interface AssinaturaSessao {
  id: string;
  planejamento_id: string;
  sessao: number;
  papel: PapelAssinatura;
  nome: string;
  profissional_id: string | null;
  registro: string | null;
  imagem: string;
  conteudo_hash: string;
  resumo: Partial<ResumoSessao> | null;
  assinada_em: string;
}

/** Resumo de uma sessão (a aberta ou uma fechada). Nulo se a sessão não existe. */
export function resumoDaSessao(p: Plano, n: number): ResumoSessao | null {
  const v = planoDaSessao(p, n);
  if (!v) return null;
  const c = contaDaSessao(p, n);
  const areas: AreaResumo[] = [];
  for (const a of todasAreas(v)) {
    const total = totalArea(v, a);
    if (!total) continue;
    const linhas: LinhaResumo[] = [];
    for (const r of v.DATA[a.id] ?? []) {
      const t = subtotalLinha(a, r);
      if (!t) continue;
      const l: LinhaResumo = a.bilateral ? { prof: r.prof, d: r.dispD ?? 0, e: r.dispE ?? 0, total: t } : { prof: r.prof, disp: r.disp ?? 0, total: t };
      if (a.regiao === "corporal") l.quad = Math.max(1, r.quad ?? 1);
      linhas.push(l);
    }
    areas.push({ id: a.id, nome: a.nome, total, linhas });
  }
  return {
    v: 1,
    paciente: p.paciente.replace(/\s+/g, " ").trim(),
    data: (v.data || "").slice(0, 10),
    sessao: n,
    sessoes: p.sessoesTotal,
    procedimento: p.procNome.trim(),
    profissional: p.profissional.trim(),
    areas,
    total: c.nesta,
    pacote: c.pacote,
    saldo: c.ultima ? c.resta : Math.max(0, c.resta),
  };
}

/** JSON com as chaves em ordem (o mesmo objeto dá sempre o mesmo texto). */
export function jsonCanonico(v: unknown): string {
  const ordenar = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(ordenar);
    if (x && typeof x === "object") {
      const o = x as Record<string, unknown>;
      return Object.fromEntries(
        Object.keys(o)
          .filter((k) => o[k] !== undefined)
          .sort()
          .map((k) => [k, ordenar(o[k])])
      );
    }
    return x;
  };
  return JSON.stringify(ordenar(v));
}

/**
 * Texto que vai para o sha256: paciente, data, número da sessão, áreas com as
 * linhas e disparos, total e saldo. Fica de fora o que não muda o atendimento
 * (procedimento, profissional, quantas sessões, o "feito").
 */
export function textoParaHash(r: ResumoSessao): string {
  return jsonCanonico({
    paciente: r.paciente,
    data: r.data,
    sessao: r.sessao,
    areas: r.areas.map((a) => ({ id: a.id, linhas: a.linhas, total: a.total })),
    total: r.total,
    saldo: r.saldo,
  });
}

/** sha256 em hexadecimal (crypto.subtle do aparelho). */
export async function sha256Hex(texto: string, subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle): Promise<string> {
  if (!subtle) throw new Error("Este aparelho não consegue conferir o conteúdo (abra o Harmonize pelo endereço seguro).");
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const hashDoResumo = (r: ResumoSessao, subtle?: SubtleCrypto) => sha256Hex(textoParaHash(r), subtle);

/** Caminho do arquivo na pasta privada "assinaturas". */
export function caminhoAssinatura(planoId: string, sessao: number, papel: PapelAssinatura, id: string): string {
  return `s/${planoId}/${sessao}/${papel}-${id}.png`;
}

/** "31/10 14:05" no horário de Brasília. */
export function dataHoraCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")} ${p("hour")}:${p("minute")}`;
}

/** "31/10/2026 às 14:05" no horário de Brasília (impressão). */
export function dataHoraCompleta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dia = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return `${dia} às ${dataHoraCurta(iso).slice(6)}`;
}

export interface SituacaoAssinaturas {
  paciente: AssinaturaSessao | null;
  profissional: AssinaturaSessao | null;
  completa: boolean;
  /** Alguma assinatura foi feita sobre um conteúdo diferente do atual. */
  alterada: boolean;
  /** Hora da assinatura mais recente. */
  ultimaEm: string | null;
  texto: string;
}

/** Situação das assinaturas de uma sessão, comparando com o hash do conteúdo atual (null = ainda calculando). */
export function situacaoAssinaturas(lista: AssinaturaSessao[], hashAtual: string | null): SituacaoAssinaturas | null {
  if (!lista.length) return null;
  const paciente = lista.find((a) => a.papel === "paciente") ?? null;
  const profissional = lista.find((a) => a.papel === "profissional") ?? null;
  const ultimaEm = lista.map((a) => a.assinada_em).sort().at(-1) ?? null;
  const alterada = hashAtual !== null && lista.some((a) => a.conteudo_hash !== hashAtual);
  const completa = !!paciente && !!profissional;
  const quando = ultimaEm ? ` em ${dataHoraCurta(ultimaEm)}` : "";
  const texto = alterada
    ? "Alterada depois de assinada"
    : completa
      ? `Assinada por paciente e profissional${quando}`
      : paciente
        ? `Assinada só pelo paciente${quando}`
        : `Assinada só pela profissional${quando}`;
  return { paciente, profissional, completa, alterada, ultimaEm, texto };
}

/** Assinaturas de uma sessão de um planejamento. */
export const assinaturasDaSessao = (lista: AssinaturaSessao[], planoId: string, n: number) =>
  lista.filter((a) => a.planejamento_id === planoId && a.sessao === n);

// ---------- Imagem da assinatura ----------

export type Ponto = { x: number; y: number };

/** Retângulo que contém todos os traços, com folga (nulo se não há traço). */
export function caixaDosTracos(tracos: Ponto[][], folga = 12): { x: number; y: number; w: number; h: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const t of tracos)
    for (const p of t) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  if (!Number.isFinite(x0)) return null;
  return { x: x0 - folga, y: y0 - folga, w: x1 - x0 + 2 * folga, h: y1 - y0 + 2 * folga };
}

/** Escala para caber em maxW x maxH sem aumentar (1 = tamanho original). */
export function escalaParaCaber(w: number, h: number, maxW: number, maxH: number): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.min(1, maxW / w, maxH / h);
}

/** Assinatura que é só um ponto ou um risquinho (toque sem querer). */
export function assinaturaVazia(tracos: Ponto[][]): boolean {
  const pontos = tracos.reduce((t, x) => t + x.length, 0);
  const c = caixaDosTracos(tracos, 0);
  return !c || pontos < 6 || (c.w < 20 && c.h < 20);
}
