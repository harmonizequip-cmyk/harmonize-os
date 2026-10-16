// Planejador HIPRO nativo: áreas, contas, alertas e o texto do resumo.
// O estado salvo (planejamentos.estado) é o mesmo objeto do planejador
// antigo em HTML (paciente, data, DATA, customAreas...), então os planos já
// guardados abrem iguais. Novidades: o "Arco Mandibular" agora se chama
// Terço médio (mesmo id, arcomandibular) e as áreas manuais guardam a parte
// do corpo em `parte` (antes iam com a imagem inteira dentro do estado).

import type { EstadoPlanejador } from "./planejamento";
import { MAXIMO_LINHA } from "./planejamento";

export const OPTS_STD = ["1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5"];
export const OPTS_PAP = [...OPTS_STD, "6.0", "7.0", "8.0", "9.0", "10.0", "11.0", "12.0", "13.0"];

export const RECOMENDACAO_PADRAO = "Beber bastante água e passar protetor solar";

export const PERFIS = [
  { valor: "0", nome: "Nenhum", disparos: 0 },
  { valor: "8000", nome: "Leve", disparos: 8000 },
  { valor: "12000", nome: "Moderado", disparos: 12000 },
  { valor: "16000", nome: "Pesado", disparos: 16000 },
];

export interface Linha {
  prof: string;
  dispD?: number;
  dispE?: number;
  disp?: number;
  /** Corporal: quadrantes de 10 x 10 cm (multiplica os disparos). */
  quad?: number;
  /** Marcado como feito no atendimento. */
  feito?: boolean;
}

export interface Area {
  id: string;
  nome: string;
  bilateral: boolean;
  opts: string[];
  hint?: string;
  regiao?: "facial" | "corporal";
  /** Corporal: região do boneco (lib/boneco-corporal). */
  parte?: string;
  manual?: boolean;
}

/** Áreas fixas, na ordem do dono (pescoço, papada, jowls, terço médio...). Nasolabial saiu (fica no Jowls) e o Submandibular entrou na Papada (regra do dono, 16/10/2026). */
export const AREAS_FIXAS: Area[] = [
  { id: "pescoco", nome: "Pescoço", bilateral: true, opts: OPTS_STD },
  { id: "papada", nome: "Submandibular e Papada", bilateral: false, opts: OPTS_PAP, hint: "Área central única. Iniciar da maior profundidade." },
  { id: "jowls", nome: "Jowls", bilateral: true, opts: OPTS_STD },
  { id: "arcomandibular", nome: "Terço médio", bilateral: true, opts: OPTS_STD },
  { id: "temporal", nome: "Temporal e Arco Zigomático", bilateral: true, opts: OPTS_STD, hint: "Usar óculos/gaze. Não tratar pálpebra." },
  { id: "frontal", nome: "Frontal", bilateral: true, opts: OPTS_STD },
  { id: "perioral_sup", nome: "Perioral Superior", bilateral: true, opts: OPTS_STD },
  { id: "perioral_inf", nome: "Perioral Inferior", bilateral: true, opts: OPTS_STD },
];

/** Como a ponteira anda em cada área (texto curto, para a tela e o prontuário). */
export const MOVIMENTO_DA_AREA: Record<string, string> = {
  frontal: "Do centro da testa para as laterais, em linhas paralelas.",
  temporal: "Em arco, de baixo do olho subindo pela lateral até a têmpora.",
  arcomandibular: "Em diagonal, do sulco perto da boca subindo até a frente da orelha.",
  jowls: "Dois campos ovais (bigode chinês e jowls), com o movimento de baixo para cima.",
  pescoco: "Da parte de baixo da orelha descendo em curva até embaixo do queixo.",
  papada: "Movimento circular no centro, abaixo do queixo, pegando a região submandibular. Não descer para a tireoide (X).",
  perioral_sup: "Entre o nariz e o lábio, do centro para os cantos.",
  perioral_inf: "Abaixo do lábio inferior, do centro para os cantos.",
};

/** Máximo por linha (por lado; papada = campo único, soma dos lados). Jowls pode passar. */
export function maximoDaLinha(areaId: string): number | null {
  if (areaId === "jowls") return null;
  if (areaId === "papada") return 2400;
  return MAXIMO_LINHA[areaId] ?? null;
}

export interface Plano {
  paciente: string;
  data: string;
  dataRetorno: string;
  queixa: string;
  profissional: string;
  perfil: string;
  procNome: string;
  valorProc: string;
  saldoTotal: string;
  obs: string;
  recomendacoes: string;
  customAreas: Area[];
  customSeq: number;
  DATA: Record<string, Linha[]>;
}

const txt = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const num = (v: unknown) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function linhaVazia(a: Area, prof?: string): Linha {
  const l: Linha = a.bilateral ? { prof: prof ?? a.opts[0], dispD: 0, dispE: 0 } : { prof: prof ?? a.opts[0], disp: 0 };
  if (a.regiao === "corporal") l.quad = 1;
  return l;
}

function normalizarLinha(a: Area, r: unknown): Linha {
  const o = (r ?? {}) as Record<string, unknown>;
  const prof = txt(o.prof) || a.opts[0];
  const l: Linha = a.bilateral ? { prof, dispD: num(o.dispD), dispE: num(o.dispE) } : { prof, disp: num(o.disp) };
  if (a.regiao === "corporal") l.quad = Math.max(1, num(o.quad) || 1);
  if (o.feito) l.feito = true;
  return l;
}

function normalizarCustom(c: unknown, i: number): Area | null {
  const o = (c ?? {}) as Record<string, unknown>;
  const id = txt(o.id) || `custom_${i + 1}`;
  const nome = txt(o.nome).trim();
  if (!nome) return null;
  const regiao = o.regiao === "corporal" ? "corporal" : "facial";
  let parte = txt(o.parte);
  const img = txt(o.img);
  const m = img.match(/\/ferramentas\/corpo\/([a-z_]+)\.svg/);
  if (!parte && m && m[1] !== "corpo") parte = m[1];
  return { id, nome, bilateral: o.bilateral !== false, opts: OPTS_PAP, regiao, ...(parte ? { parte } : {}), manual: true };
}

/** Hoje no fuso de São Paulo (AAAA-MM-DD). */
export function hojeIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Estado salvo (formato antigo ou novo) → plano completo, com toda área fixa presente. */
export function normalizarPlano(e: EstadoPlanejador | null | undefined, hoje = hojeIso()): Plano {
  const s = (e ?? {}) as Record<string, unknown>;
  let customAreas = (Array.isArray(s.customAreas) ? s.customAreas : []).map(normalizarCustom).filter((a): a is Area => !!a);
  const bruto = (s.DATA && typeof s.DATA === "object" ? s.DATA : {}) as Record<string, unknown>;
  const DATA: Record<string, Linha[]> = {};
  for (const a of [...AREAS_FIXAS, ...customAreas]) {
    const linhas = Array.isArray(bruto[a.id]) ? (bruto[a.id] as unknown[]) : [];
    DATA[a.id] = linhas.length ? linhas.map((r) => normalizarLinha(a, r)) : [linhaVazia(a)];
  }
  // Planos antigos: o Submandibular (D/E) vira linhas da área única "Submandibular e
  // Papada" (soma dos lados) e a área manual Nasolabial vai para o Jowls.
  const juntar = (destino: string, novas: Linha[]) => {
    if (!novas.length) return;
    const atuais = DATA[destino].filter((l) => (l.disp ?? 0) + (l.dispD ?? 0) + (l.dispE ?? 0) > 0);
    DATA[destino] = [...atuais, ...novas];
  };
  if (Array.isArray(bruto.submandibular)) {
    const papada = AREAS_FIXAS.find((a) => a.id === "papada")!;
    juntar(
      "papada",
      (bruto.submandibular as unknown[])
        .map((r) => normalizarLinha({ ...papada, bilateral: true }, r))
        .filter((l) => (l.dispD ?? 0) + (l.dispE ?? 0) > 0)
        .map((l) => ({ prof: l.prof, disp: (l.dispD ?? 0) + (l.dispE ?? 0), ...(l.feito ? { feito: true } : {}) }))
    );
  }
  const nasolabiais = customAreas.filter((a) => a.regiao !== "corporal" && /nasolabial/i.test(a.nome));
  if (nasolabiais.length) {
    const jowls = AREAS_FIXAS.find((a) => a.id === "jowls")!;
    for (const a of nasolabiais) {
      juntar(
        "jowls",
        (DATA[a.id] ?? [])
          .filter((l) => subtotalLinha(a, l) > 0)
          .map((l) => (a.bilateral ? normalizarLinha(jowls, l) : normalizarLinha(jowls, { prof: l.prof, dispD: Math.ceil((l.disp ?? 0) / 2), dispE: Math.floor((l.disp ?? 0) / 2), feito: l.feito })))
      );
      delete DATA[a.id];
    }
    customAreas = customAreas.filter((a) => !nasolabiais.includes(a));
  }
  const seqSalvo = num(s.customSeq);
  const maiorId = customAreas.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, "")) || 0), 0);
  return {
    paciente: txt(s.paciente),
    data: txt(s.data) || hoje,
    dataRetorno: txt(s.dataRetorno),
    queixa: txt(s.queixa),
    profissional: txt(s.profissional),
    perfil: txt(s.perfil) || "0",
    procNome: txt(s.procNome),
    valorProc: txt(s.valorProc),
    saldoTotal: String(num(s.saldoTotal)),
    obs: txt(s.obs),
    recomendacoes: txt(s.recomendacoes) || RECOMENDACAO_PADRAO,
    customAreas,
    customSeq: Math.max(seqSalvo, maiorId),
    DATA,
  };
}

/** Plano → objeto guardado no banco (mesmas chaves do planejador antigo). */
export function paraEstado(p: Plano): EstadoPlanejador {
  return {
    paciente: p.paciente,
    data: p.data,
    dataRetorno: p.dataRetorno,
    queixa: p.queixa,
    profissional: p.profissional,
    perfil: p.perfil,
    procNome: p.procNome,
    valorProc: p.valorProc,
    saldoTotal: p.saldoTotal,
    obs: p.obs,
    recomendacoes: p.recomendacoes,
    modoResumo: "lista",
    customAreas: p.customAreas.map(({ id, nome, bilateral, regiao, parte }) => ({ id, nome, bilateral, regiao: regiao ?? "facial", ...(parte ? { parte } : {}) })),
    customSeq: p.customSeq,
    DATA: p.DATA as Record<string, unknown[]>,
  };
}

/** Fixas, depois manuais do rosto, depois corporais (ordem da tela e do prontuário). */
export function todasAreas(p: Plano): Area[] {
  return [...AREAS_FIXAS, ...p.customAreas.filter((a) => a.regiao !== "corporal"), ...p.customAreas.filter((a) => a.regiao === "corporal")];
}

export function subtotalLinha(a: Area, r: Linha): number {
  const base = a.bilateral ? (r.dispD ?? 0) + (r.dispE ?? 0) : r.disp ?? 0;
  return base * (a.regiao === "corporal" ? Math.max(1, r.quad ?? 1) : 1);
}

export function totalArea(p: Plano, a: Area): number {
  return (p.DATA[a.id] ?? []).reduce((s, r) => s + subtotalLinha(a, r), 0);
}

export function totalDistribuido(p: Plano): number {
  return todasAreas(p).reduce((s, a) => s + totalArea(p, a), 0);
}

export const saldoDe = (p: Plano) => Number(p.saldoTotal) || 0;

export type EstadoSaldo = "ok" | "baixo" | "estourado" | "sem_saldo";

export function situacaoSaldo(p: Plano): { saldo: number; total: number; resta: number; pct: number; estado: EstadoSaldo } {
  const saldo = saldoDe(p);
  const total = totalDistribuido(p);
  const resta = saldo - total;
  const pct = saldo > 0 ? Math.max(0, Math.min(100, (resta / saldo) * 100)) : 0;
  const estado: EstadoSaldo = saldo <= 0 ? "sem_saldo" : resta < 0 ? "estourado" : pct < 20 && total > 0 ? "baixo" : "ok";
  return { saldo, total, resta, pct, estado };
}

export interface Alerta {
  texto: string;
  grave: boolean;
  areaId?: string;
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

/** Alertas do protocolo: saldo e linhas acima do máximo do fabricante. */
export function alertas(p: Plano): Alerta[] {
  const out: Alerta[] = [];
  const s = situacaoSaldo(p);
  if (s.estado === "estourado") out.push({ texto: `Distribuído (${fmt(s.total)}) passa do saldo (${fmt(s.saldo)}) em ${fmt(-s.resta)} disparos.`, grave: true });
  else if (s.estado === "baixo") out.push({ texto: `Saldo baixo: restam ${fmt(s.resta)} disparos (${Math.round(s.pct)}%).`, grave: false });
  for (const a of AREAS_FIXAS) {
    const max = maximoDaLinha(a.id);
    if (!max) continue;
    for (const r of p.DATA[a.id] ?? []) {
      const valores = a.bilateral ? [r.dispD ?? 0, r.dispE ?? 0] : [r.disp ?? 0];
      if (valores.some((v) => v > max)) {
        out.push({ texto: `${a.nome} ${r.prof} mm acima do máximo do fabricante (${fmt(max)}${a.bilateral ? " por lado" : ""}).`, grave: false, areaId: a.id });
      }
    }
  }
  return out;
}

export function linhaAcimaDoMaximo(a: Area, r: Linha): number | null {
  const max = maximoDaLinha(a.id);
  if (!max || a.manual) return null;
  const valores = a.bilateral ? [r.dispD ?? 0, r.dispE ?? 0] : [r.disp ?? 0];
  return valores.some((v) => v > max) ? max : null;
}

export function areasPreenchidas(p: Plano): number {
  return todasAreas(p).filter((a) => totalArea(p, a) > 0).length;
}

export function dataBr(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Máscara de valor: só dígitos viram "R$ 1.234,56". */
export function mascaraReais(v: string): string {
  const d = v.replace(/\D/g, "");
  if (!d) return "";
  const n = (parseInt(d, 10) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${n}`;
}

/** Texto do resumo (WhatsApp ou colar no prontuário), no mesmo formato do planejador antigo. */
export function textoResumo(p: Plano, agora = new Date()): string {
  const s = situacaoSaldo(p);
  let t = "";
  t += "══════════════════════════════════\n";
  t += "   HARMONIZE – PLANEJAMENTO HIPRO \n";
  t += "       Protocolo Oficial HOF      \n";
  t += "══════════════════════════════════\n\n";
  t += `Paciente:     ${p.paciente || "—"}\n`;
  t += `Data:         ${dataBr(p.data)}\n`;
  t += `Retorno:      ${p.dataRetorno ? dataBr(p.dataRetorno) : "—"}\n`;
  t += `Profissional: ${p.profissional || "—"}\n`;
  t += `Procedimento: ${p.procNome || "—"}\n`;
  t += `Valor:        ${p.valorProc || "—"}\n`;
  t += `Queixa:       ${p.queixa || "—"}\n\n`;
  t += `Saldo total:  ${fmt(s.saldo)} disparos\n`;
  t += `Distribuído:  ${fmt(s.total)} disparos\n`;
  t += `Restante:     ${fmt(s.resta)} disparos\n`;
  t += "\n──────────────────────────────────\n";
  t += "          ÁREAS TRATADAS\n";
  t += "──────────────────────────────────\n\n";
  for (const a of todasAreas(p)) {
    const tot = totalArea(p, a);
    if (!tot) continue;
    const corporal = a.regiao === "corporal";
    const tipo = corporal ? (a.bilateral ? "CORPORAL D/E" : "CORPORAL") : a.bilateral ? "D/E" : "Único";
    t += `▸ ${a.nome.toUpperCase()} (${tipo})\n`;
    for (const r of p.DATA[a.id] ?? []) {
      const q = corporal ? Math.max(1, r.quad ?? 1) : 1;
      const chk = r.feito ? "[x]" : "[ ]";
      if (a.bilateral) {
        const d = r.dispD ?? 0;
        const e = r.dispE ?? 0;
        if (!d && !e) continue;
        t += corporal ? `  ${chk} ${r.prof}mm → D:${d} | E:${e} × ${q} quad. = ${fmt((d + e) * q)}\n` : `  ${chk} ${r.prof}mm → D:${d} | E:${e} | Sub:${d + e}\n`;
      } else {
        if (!r.disp) continue;
        t += corporal ? `  ${chk} ${r.prof}mm → ${r.disp}/quad × ${q} quad. = ${fmt(r.disp * q)}\n` : `  ${chk} ${r.prof}mm → ${r.disp} disparos\n`;
      }
    }
    t += `  Total: ${fmt(tot)} disparos\n\n`;
  }
  if (p.obs) t += "──────────────────────────────────\nOBSERVAÇÕES:\n" + p.obs + "\n\n";
  if (p.recomendacoes) t += "──────────────────────────────────\nRECOMENDAÇÕES:\n" + p.recomendacoes + "\n\n";
  t += "══════════════════════════════════\n";
  t += `  ${agora.toLocaleString("pt-BR")}\n`;
  t += "══════════════════════════════════";
  return t;
}
