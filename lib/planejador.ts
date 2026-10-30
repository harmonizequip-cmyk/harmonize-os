// Planejador HIPRO nativo: áreas, contas, alertas e o texto do resumo.
// O estado salvo (planejamentos.estado) é o mesmo objeto do planejador
// antigo em HTML (paciente, data, DATA, customAreas...), então os planos já
// guardados abrem iguais. Novidades: o "Arco Mandibular" agora se chama
// Terço médio (mesmo id, arcomandibular) e as áreas manuais guardam a parte
// do corpo em `parte` (antes iam com a imagem inteira dentro do estado).

import type { EstadoPlanejador } from "./planejamento";
import { MAXIMO_LINHA, MINIMO_LINHA, MAX_PROFUNDIDADES } from "./planejamento";

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

/** Áreas fixas, na ordem do dono (pescoço, papada, submandibular, jowls, terço médio...). Nasolabial saiu (fica no Jowls). Papada (campo único) e Submandibular (direito e esquerdo) são áreas separadas, com a mesma foto (regra do dono, 19 e 22/10/2026). Temporal e Arco Zigomático saiu: só ficou Pálpebras inferiores e lateral dos olhos (23/10/2026). */
export const AREAS_FIXAS: Area[] = [
  { id: "pescoco", nome: "Pescoço", bilateral: true, opts: OPTS_STD },
  { id: "papada", nome: "Papada", bilateral: false, opts: OPTS_PAP, hint: "Área central única. Iniciar da maior profundidade." },
  { id: "submandibular", nome: "Submandibular", bilateral: true, opts: OPTS_STD, hint: "Direito e esquerdo, de 600 a 1.200 por lado em cada profundidade. Iniciar da maior profundidade." },
  { id: "jowls", nome: "Jowls", bilateral: true, opts: ["4.5"], hint: "Só a profundidade 4,5 mm, até 1.500 por lado (derretimento da face chega perto do máximo)." },
  { id: "arcomandibular", nome: "Terço médio", bilateral: true, opts: OPTS_STD, hint: "De 600 a 1.200 por lado em cada profundidade." },
  { id: "olhos", nome: "Pálpebras inferiores e lateral dos olhos", bilateral: true, opts: OPTS_STD, hint: "Usar gaze, nunca sobre o globo ocular. Normalmente 1,5 mm, até 500 por lado." },
  { id: "frontal", nome: "Frontal", bilateral: true, opts: ["1.5"], hint: "Uma profundidade só (1,5 mm), até 500 por lado." },
  { id: "perioral_sup", nome: "Perioral Superior", bilateral: true, opts: OPTS_STD },
  { id: "perioral_inf", nome: "Perioral Inferior", bilateral: true, opts: OPTS_STD },
];

/** Como a ponteira anda em cada área (texto curto, para a tela e o prontuário). */
export const MOVIMENTO_DA_AREA: Record<string, string> = {
  frontal: "Do centro da testa para as laterais, em linhas paralelas.",
  olhos: "Em arco, de baixo do olho subindo pela lateral até a têmpora. Usar gaze e nunca passar sobre o globo ocular.",
  arcomandibular: "Em diagonal, do sulco perto da boca subindo até a frente da orelha.",
  jowls: "Dois campos ovais (bigode chinês e jowls), com o movimento de baixo para cima.",
  pescoco: "Da parte de baixo da orelha descendo em curva até embaixo do queixo.",
  papada: "Movimento circular no centro, abaixo do queixo, pegando a região submandibular. Não descer para a tireoide (X).",
  submandibular: "Movimento circular no centro, abaixo do queixo, pegando a região submandibular. Não descer para a tireoide (X).",
  perioral_sup: "Entre o nariz e o lábio, do centro para os cantos.",
  perioral_inf: "Abaixo do lábio inferior, do centro para os cantos.",
};

/** Máximo por linha (por lado; papada = campo único, soma dos lados). Jowls: 1.500 por lado, só em 4,5 mm. */
export function maximoDaLinha(areaId: string): number | null {
  if (areaId === "papada") return 2400;
  return MAXIMO_LINHA[areaId] ?? null;
}

/** Mínimo por lado em cada profundidade que tem disparo (Terço médio e Submandibular: 600). */
export function minimoDaLinha(areaId: string): number | null {
  return MINIMO_LINHA[areaId] ?? null;
}

export interface Plano {
  paciente: string;
  /** Cadastro do paciente (tabela pacientes) escolhido na tela; "" = o banco acha ou cria pelo nome. */
  pacienteId: string;
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
  /** Quantas sessões o paciente vai fazer (o saldo total é o do pacote inteiro). */
  sessoesTotal: number;
  /** Sessão que está aberta agora (1 = primeira). */
  sessaoAtual: number;
  /** Sessões já fechadas, com o que foi distribuído em cada uma. */
  sessoesAnteriores: SessaoFechada[];
}

export interface SessaoFechada {
  n: number;
  data: string;
  DATA: Record<string, Linha[]>;
  customAreas: Area[];
}

export const MAX_SESSOES = 12;

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
  // Linha de campo único (disp) numa área que agora tem os dois lados: divide entre direito e esquerdo.
  const soDisp = a.bilateral && o.dispD === undefined && o.dispE === undefined && o.disp !== undefined;
  const l: Linha = a.bilateral
    ? soDisp
      ? { prof, dispD: Math.ceil(num(o.disp) / 2), dispE: Math.floor(num(o.disp) / 2) }
      : { prof, dispD: num(o.dispD), dispE: num(o.dispE) }
    : { prof, disp: num(o.disp) };
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
  const bruto = temporalParaOlhos((s.DATA && typeof s.DATA === "object" ? s.DATA : {}) as Record<string, unknown>);
  const DATA = lerDATA(bruto, customAreas);
  // Planos antigos: a área manual Nasolabial vai para o Jowls.
  const juntar = (destino: string, novas: Linha[]) => {
    if (!novas.length) return;
    const atuais = DATA[destino].filter((l) => (l.disp ?? 0) + (l.dispD ?? 0) + (l.dispE ?? 0) > 0);
    DATA[destino] = [...atuais, ...novas];
  };
  // Áreas manuais que viraram fixas: o que estava nelas vai para a área certa (Nasolabial para o Jowls,
  // "Pálpebra"/"Olho" para Pálpebras inferiores e lateral dos olhos).
  const absorver = (destinoId: string, regex: RegExp) => {
    const manuais = customAreas.filter((a) => a.regiao !== "corporal" && regex.test(a.nome));
    if (!manuais.length) return;
    const destino = AREAS_FIXAS.find((a) => a.id === destinoId)!;
    for (const a of manuais) {
      juntar(
        destinoId,
        (DATA[a.id] ?? [])
          .filter((l) => subtotalLinha(a, l) > 0)
          .map((l) => (a.bilateral ? normalizarLinha(destino, l) : normalizarLinha(destino, { prof: l.prof, dispD: Math.ceil((l.disp ?? 0) / 2), dispE: Math.floor((l.disp ?? 0) / 2), feito: l.feito })))
      );
      delete DATA[a.id];
    }
    customAreas = customAreas.filter((a) => !manuais.includes(a));
  };
  absorver("jowls", /nasolabial/i);
  absorver("olhos", /p[aá]lpebra|olho/i);
  const seqSalvo = num(s.customSeq);
  const maiorId = customAreas.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, "")) || 0), 0);
  return {
    paciente: txt(s.paciente),
    pacienteId: txt(s.pacienteId),
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
    sessoesTotal: Math.min(MAX_SESSOES, Math.max(1, num(s.sessoesTotal) || 1)),
    sessaoAtual: Math.max(1, num(s.sessaoAtual) || 1),
    sessoesAnteriores: lerSessoesAnteriores(s.sessoesAnteriores),
  };
}

/** A área Temporal e Arco Zigomático saiu (era a mesma região dos olhos): o que estava nela vai para "Pálpebras inferiores e lateral dos olhos". */
function temporalParaOlhos(bruto: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(bruto.temporal)) return bruto;
  const { temporal, ...resto } = bruto;
  const com = (l: unknown) => {
    const o = (l ?? {}) as Record<string, unknown>;
    return num(o.dispD) + num(o.dispE) + num(o.disp) > 0;
  };
  const novas = (temporal as unknown[]).filter(com);
  const atuais = Array.isArray(resto.olhos) ? (resto.olhos as unknown[]).filter(com) : [];
  return novas.length ? { ...resto, olhos: [...atuais, ...novas] } : resto;
}

/** DATA completo: toda área (fixa e manual) com ao menos uma linha. */
function lerDATA(bruto: Record<string, unknown>, customAreas: Area[]): Record<string, Linha[]> {
  const DATA: Record<string, Linha[]> = {};
  for (const a of [...AREAS_FIXAS, ...customAreas]) {
    const linhas = Array.isArray(bruto[a.id]) ? (bruto[a.id] as unknown[]) : [];
    DATA[a.id] = linhas.length ? linhas.map((r) => normalizarLinha(a, r)) : [linhaVazia(a)];
  }
  return DATA;
}

function lerSessoesAnteriores(v: unknown): SessaoFechada[] {
  if (!Array.isArray(v)) return [];
  const out: SessaoFechada[] = [];
  v.forEach((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const custom = (Array.isArray(o.customAreas) ? o.customAreas : []).map(normalizarCustom).filter((a): a is Area => !!a);
    const bruto = temporalParaOlhos((o.DATA && typeof o.DATA === "object" ? o.DATA : {}) as Record<string, unknown>);
    out.push({ n: num(o.n) || i + 1, data: txt(o.data), customAreas: custom, DATA: lerDATA(bruto, custom) });
  });
  return out.sort((a, b) => a.n - b.n);
}

const areasCustomParaEstado = (areas: Area[]) =>
  areas.map(({ id, nome, bilateral, regiao, parte }) => ({ id, nome, bilateral, regiao: regiao ?? "facial", ...(parte ? { parte } : {}) }));

/** Plano → objeto guardado no banco (mesmas chaves do planejador antigo). */
export function paraEstado(p: Plano): EstadoPlanejador {
  return {
    paciente: p.paciente,
    ...(p.pacienteId ? { pacienteId: p.pacienteId } : {}),
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
    customAreas: areasCustomParaEstado(p.customAreas),
    customSeq: p.customSeq,
    DATA: p.DATA as Record<string, unknown[]>,
    sessoesTotal: p.sessoesTotal,
    sessaoAtual: p.sessaoAtual,
    sessoesAnteriores: p.sessoesAnteriores.map((x) => ({ n: x.n, data: x.data, DATA: x.DATA, customAreas: areasCustomParaEstado(x.customAreas) })),
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

const somaDATA = (areas: Area[], DATA: Record<string, Linha[]>) =>
  areas.reduce((t, a) => t + (DATA[a.id] ?? []).reduce((s, r) => s + subtotalLinha(a, r), 0), 0);

/** Disparos distribuídos numa sessão já fechada. */
export function totalDaSessao(x: SessaoFechada): number {
  return somaDATA([...AREAS_FIXAS, ...x.customAreas], x.DATA);
}

/** Disparos do pacote já usados nas sessões anteriores a `ate` (padrão: a sessão aberta). */
export function usadoEmAnteriores(p: Plano, ate = p.sessaoAtual): number {
  return p.sessoesAnteriores.filter((x) => x.n < ate).reduce((t, x) => t + totalDaSessao(x), 0);
}

/**
 * Saldo do pacote. `saldoTotal` é o pacote inteiro (todas as sessões): o que sobra
 * depois desta sessão (resta) é o crédito para as próximas. Com 1 sessão só, é o
 * saldo de sempre.
 */
export function situacaoSaldo(p: Plano): {
  saldo: number;
  total: number;
  resta: number;
  pct: number;
  estado: EstadoSaldo;
  anteriores: number;
  disponivel: number;
  sessao: number;
  sessoes: number;
  /** Crédito que fica para as próximas sessões (0 na última). */
  paraProximas: number;
} {
  const saldo = saldoDe(p);
  const total = totalDistribuido(p);
  const anteriores = usadoEmAnteriores(p);
  const disponivel = saldo - anteriores;
  const resta = disponivel - total;
  const pct = disponivel > 0 ? Math.max(0, Math.min(100, (resta / disponivel) * 100)) : 0;
  const ultima = p.sessaoAtual >= p.sessoesTotal;
  const estado: EstadoSaldo = saldo <= 0 ? "sem_saldo" : resta < 0 ? "estourado" : ultima && pct < 20 && total > 0 ? "baixo" : "ok";
  return { saldo, total, resta, pct, estado, anteriores, disponivel, sessao: p.sessaoAtual, sessoes: p.sessoesTotal, paraProximas: ultima ? 0 : Math.max(0, resta) };
}

/** Plano como estava numa sessão (a aberta ou uma fechada), para imprimir a ficha dela. */
export function planoDaSessao(p: Plano, n: number): Plano | null {
  if (n === p.sessaoAtual) return p;
  const x = p.sessoesAnteriores.find((y) => y.n === n);
  return x ? { ...p, data: x.data || p.data, DATA: x.DATA, customAreas: x.customAreas } : null;
}

/** Contas de uma sessão: pacote, usado antes, distribuído nela e o que sobra para as próximas. */
export function contaDaSessao(p: Plano, n: number) {
  const v = planoDaSessao(p, n);
  const pacote = saldoDe(p);
  const antes = usadoEmAnteriores(p, n);
  const nesta = v ? totalDistribuido(v) : 0;
  return { n, sessoes: p.sessoesTotal, pacote, antes, nesta, resta: pacote - antes - nesta, ultima: n >= p.sessoesTotal };
}

/** Fecha a sessão aberta e abre a próxima, sem disparos, com a data do retorno. Nulo se não dá. */
export function fecharSessao(p: Plano, hoje = hojeIso()): Plano | null {
  if (p.sessaoAtual >= p.sessoesTotal || totalDistribuido(p) <= 0) return null;
  const DATA: Record<string, Linha[]> = {};
  for (const a of AREAS_FIXAS) DATA[a.id] = [linhaVazia(a)];
  return {
    ...p,
    sessoesAnteriores: [...p.sessoesAnteriores, { n: p.sessaoAtual, data: p.data, DATA: p.DATA, customAreas: p.customAreas }],
    sessaoAtual: p.sessaoAtual + 1,
    data: p.dataRetorno || hoje,
    dataRetorno: "",
    customAreas: [],
    DATA,
  };
}

/** Volta para a sessão anterior (o que estava aberto agora é descartado). Nulo se não há anterior. */
export function reabrirSessaoAnterior(p: Plano): Plano | null {
  const ultima = p.sessoesAnteriores[p.sessoesAnteriores.length - 1];
  if (!ultima) return null;
  return {
    ...p,
    sessoesAnteriores: p.sessoesAnteriores.slice(0, -1),
    sessaoAtual: ultima.n,
    data: ultima.data || p.data,
    customAreas: ultima.customAreas,
    DATA: ultima.DATA,
  };
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
  if (s.estado === "estourado") out.push({ texto: `Distribuído (${fmt(s.total)}) passa do saldo${s.anteriores > 0 ? " que sobrou" : ""} (${fmt(s.disponivel)}) em ${fmt(-s.resta)} disparos.`, grave: true });
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
  for (const a of AREAS_FIXAS) {
    const limite = MAX_PROFUNDIDADES[a.id];
    if (limite) {
      const usadas = new Set((p.DATA[a.id] ?? []).filter((r) => subtotalLinha(a, r) > 0).map((r) => r.prof));
      if (usadas.size > limite) out.push({ texto: `${a.nome} só pode ter ${limite} profundidade (${a.opts[0].replace(".", ",")} mm), e há ${usadas.size} com disparos.`, grave: false, areaId: a.id });
    }
    for (const r of p.DATA[a.id] ?? []) {
      const min = linhaAbaixoDoMinimo(a, r);
      if (min) out.push({ texto: `${a.nome} ${r.prof} mm abaixo do mínimo (${fmt(min)} por lado).`, grave: false, areaId: a.id });
    }
  }
  return out;
}

/** Linha com disparos em que algum lado fica abaixo do mínimo da área (Terço médio, Submandibular). */
export function linhaAbaixoDoMinimo(a: Area, r: Linha): number | null {
  const min = minimoDaLinha(a.id);
  if (!min || a.manual || !a.bilateral) return null;
  const d = r.dispD ?? 0;
  const e = r.dispE ?? 0;
  if (d + e <= 0) return null;
  return d < min || e < min ? min : null;
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
  if (p.sessoesTotal > 1) {
    t += `Sessão:       ${p.sessaoAtual} de ${p.sessoesTotal}\n`;
    t += `Pacote:       ${fmt(s.saldo)} disparos\n`;
    if (s.anteriores > 0) t += `Já usados:    ${fmt(s.anteriores)} disparos (sessões anteriores)\n`;
    t += `Nesta sessão: ${fmt(s.total)} disparos\n`;
    t += s.sessao < s.sessoes ? `Para a próxima sessão: ${fmt(Math.max(0, s.resta))} disparos\n` : `Restante:     ${fmt(s.resta)} disparos\n`;
  } else {
    t += `Saldo total:  ${fmt(s.saldo)} disparos\n`;
    t += `Distribuído:  ${fmt(s.total)} disparos\n`;
    t += `Restante:     ${fmt(s.resta)} disparos\n`;
  }
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
