// Planejador HIPRO dentro do app (tela nativa em app/(app)/planejador, contas
// em lib/planejador.ts): aqui ficam as contas da lista, o que decide quando
// vale guardar no banco e a montagem pelas regras. Terço médio usa o id
// antigo "arcomandibular"; Nasolabial saiu (fica dentro do Jowls).

import { urlBoneco } from "./boneco-corporal";

export interface EstadoPlanejador {
  paciente?: string;
  data?: string;
  dataRetorno?: string;
  queixa?: string;
  profissional?: string;
  procNome?: string;
  saldoTotal?: string;
  obs?: string;
  DATA?: Record<string, unknown[]>;
  [k: string]: unknown;
}

export interface PlanejamentoLinha {
  id: string;
  client_id: string | null;
  calendar_event_id: string | null;
  paciente: string | null;
  data: string | null;
  data_retorno: string | null;
  procedimento: string | null;
  saldo_total: number;
  total_disparos: number;
  updated_at: string;
  cliente_nome: string | null;
  /** Criado pelo login da própria cliente (portal). */
  pela_cliente?: boolean;
}

/** Estado com que um planejamento novo abre: profissional e data já preenchidos. */
export function estadoInicial(profissional?: string | null, data?: string | null): EstadoPlanejador {
  const e: EstadoPlanejador = {};
  if (profissional) e.profissional = profissional;
  if (data) e.data = data.slice(0, 10);
  return e;
}

/** Só vira registro no banco quando tem algo de verdade (evita planejamentos vazios). */
export function temConteudo(e: EstadoPlanejador | null | undefined, total = 0): boolean {
  if (!e) return false;
  const txt = (v: unknown) => typeof v === "string" && v.trim().length > 0;
  return txt(e.paciente) || txt(e.queixa) || txt(e.obs) || txt(e.procNome) || total > 0;
}

/** Dias até a data (negativo = passou). Datas AAAA-MM-DD, sem fuso. */
export function diasAte(data: string, hoje: string): number {
  return Math.round((Date.parse(data.slice(0, 10) + "T12:00:00Z") - Date.parse(hoje + "T12:00:00Z")) / 86400000);
}

/** Retornos dos próximos N dias (inclui hoje), do mais perto para o mais longe. */
export function retornosProximos(lista: PlanejamentoLinha[], hoje: string, dias = 15): PlanejamentoLinha[] {
  return lista
    .filter((p) => p.data_retorno && diasAte(p.data_retorno, hoje) >= 0 && diasAte(p.data_retorno, hoje) <= dias)
    .sort((a, b) => (a.data_retorno ?? "").localeCompare(b.data_retorno ?? ""));
}

/** Agrupa por cliente (sem cliente por último), cada grupo do mais recente para o mais antigo. */
export function agruparPorCliente(lista: PlanejamentoLinha[]): { clientId: string | null; nome: string; itens: PlanejamentoLinha[] }[] {
  const grupos = new Map<string, { clientId: string | null; nome: string; itens: PlanejamentoLinha[] }>();
  for (const p of lista) {
    const k = p.client_id ?? "";
    if (!grupos.has(k)) grupos.set(k, { clientId: p.client_id, nome: p.cliente_nome ?? "Sem cliente", itens: [] });
    grupos.get(k)!.itens.push(p);
  }
  const ordenar = (a: PlanejamentoLinha, b: PlanejamentoLinha) =>
    (b.data ?? "").localeCompare(a.data ?? "") || b.updated_at.localeCompare(a.updated_at);
  return Array.from(grupos.values())
    .map((g) => ({ ...g, itens: [...g.itens].sort(ordenar) }))
    .sort((a, b) => (a.clientId ? 0 : 1) - (b.clientId ? 0 : 1) || ordenar(a.itens[0], b.itens[0]));
}

// Seletor de áreas do assistente: catálogo (fixas do planejador + manuais do
// guia) e o nome do procedimento que sai da escolha.
export interface AreaCatalogo {
  id: string;
  nome: string;
  /** face = do queixo até a testa (compõe o Full Face); fora = soma no nome. */
  grupo: "face" | "fora";
  /** Área pequena: não precisa estar marcada para contar como Full Face. */
  pequena?: boolean;
}

export const CATALOGO_AREAS: AreaCatalogo[] = [
  { id: "frontal", nome: "Frontal", grupo: "face" },
  { id: "temporal", nome: "Temporal e Arco Zigomático", grupo: "face" },
  { id: "olhos", nome: "Pálpebras inferiores e lateral dos olhos", grupo: "face", pequena: true },
  { id: "arcomandibular", nome: "Terço médio", grupo: "face" },
  { id: "perioral_sup", nome: "Perioral Superior", grupo: "face", pequena: true },
  { id: "perioral_inf", nome: "Perioral Inferior", grupo: "face", pequena: true },
  { id: "mento", nome: "Mento", grupo: "face", pequena: true },
  { id: "jowls", nome: "Jowls", grupo: "face" },
  { id: "papada", nome: "Submandibular e Papada", grupo: "fora" },
  { id: "pescoco", nome: "Pescoço", grupo: "fora" },
];

/**
 * Nome do procedimento pela escolha: todas as áreas grandes do rosto (do
 * queixo à testa) = "Full Face"; o que é de fora soma no nome ("Full Face +
 * Papada + Pescoço"). Sem o rosto completo, lista as áreas.
 */
export function nomeProcedimento(ids: string[]): string {
  const sel = new Set(ids);
  const grandesRosto = CATALOGO_AREAS.filter((a) => a.grupo === "face" && !a.pequena);
  const fullFace = grandesRosto.every((a) => sel.has(a.id));
  const fora = CATALOGO_AREAS.filter((a) => a.grupo === "fora" && sel.has(a.id)).map((a) => a.nome);
  if (fullFace) return ["Full Face", ...fora].join(" + ");
  const todas = CATALOGO_AREAS.filter((a) => sel.has(a.id)).map((a) => a.nome);
  return todas.join(" + ");
}

// Papada: profundidades pelo adipômetro (metade da medida, até 13 mm) e
// disparos divididos entre elas. Espelhado em supabase/functions/assistente.
export const PROFUNDIDADES_PAPADA = [4.5, 6, 7, 8, 9, 10, 11, 12, 13];

/** Profundidade mais funda: metade do adipômetro, arredondada para baixo numa que existe (4,5 a 13). */
export function profundidadeMaximaPapada(adipometroMm: number): number {
  const alvo = adipometroMm / 2;
  const cabem = PROFUNDIDADES_PAPADA.filter((p) => p <= alvo);
  return cabem.length ? cabem[cabem.length - 1] : 4.5;
}

/**
 * Até 5 profundidades: sempre 4,5 e a mais funda; as do meio, as que
 * existem mais perto de intervalos iguais. Volta da mais funda para a mais
 * rasa (o planejador manda começar pela maior).
 */
export function profundidadesPapada(adipometroMm: number, quantidade: number): number[] {
  const max = profundidadeMaximaPapada(adipometroMm);
  const cands = PROFUNDIDADES_PAPADA.filter((p) => p <= max);
  const n = Math.max(1, Math.min(5, Math.round(quantidade) || 1, cands.length));
  if (n === 1) return [max];
  const escolhidas = new Set<number>([4.5, max]);
  for (let i = 1; i < n - 1; i++) {
    const alvo = 4.5 + ((max - 4.5) * i) / (n - 1);
    const livre = cands.filter((p) => !escolhidas.has(p)).sort((a, b) => Math.abs(a - alvo) - Math.abs(b - alvo) || b - a)[0];
    if (livre !== undefined) escolhidas.add(livre);
  }
  return Array.from(escolhidas).sort((a, b) => b - a);
}

/** Divide os disparos igual entre as profundidades (múltiplos de 10; a sobra vai para a mais funda). */
export function dividirDisparos(total: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.floor(total / partes / 10) * 10;
  const r = Array(partes).fill(base);
  r[0] += Math.max(0, Math.round(total) - base * partes);
  return r;
}

// ─── Montagem pelas regras (o seletor monta sozinho; a IA só ajusta) ───

/** Máximo por lado em cada profundidade (tabela do fabricante + regra do dono). */
export const MAXIMO_LINHA: Record<string, number> = {
  pescoco: 1200,
  jowls: 1200,
  arcomandibular: 1200,
  temporal: 1200,
  frontal: 500,
  perioral_sup: 600,
  perioral_inf: 600,
  olhos: 1200,
  mento: 1200,
};

/** Profundidades de cada área do rosto (regra: 4,5, 3,0 e 1,5; exceções do guia). */
export function profundidadesRosto(id: string): number[] {
  if (id === "frontal" || id === "olhos") return [4.5, 1.5];
  if (id === "perioral_sup" || id === "perioral_inf") return [1.5];
  return [4.5, 3, 1.5];
}

const AREAS_FIXAS_PLANEJADOR = new Set(["pescoco", "papada", "jowls", "arcomandibular", "temporal", "frontal", "perioral_sup", "perioral_inf"]);
const AREA_UNICA = new Set(["papada", "mento"]);
const NOME_EXTRA: Record<string, string> = { olhos: "Pálpebras inferiores e lateral dos olhos", mento: "Mento" };

export const PROFUNDIDADES_GORDURA = [6, 7, 8, 9, 10, 11, 12, 13];
export const DISPAROS_CORPORAL = { min: 3200, max: 4000 };

/** Gordura corporal: de 6,0 até a metade do adipômetro (acima de 26 mm fica 13), no mínimo 3 profundidades. */
export function profundidadesGordura(adipometroMm: number, quantidade: number): number[] {
  const alvo = Math.min(13, adipometroMm / 2);
  const cabem = PROFUNDIDADES_GORDURA.filter((p) => p <= alvo);
  const max = cabem.length ? cabem[cabem.length - 1] : 6;
  const cands = PROFUNDIDADES_GORDURA.filter((p) => p <= max);
  const n = Math.max(1, Math.min(Math.max(3, Math.round(quantidade) || 3), cands.length));
  if (n === 1) return [max];
  const escolhidas = new Set<number>([6, max]);
  for (let i = 1; i < n - 1; i++) {
    const alvoI = 6 + ((max - 6) * i) / (n - 1);
    const livre = cands.filter((p) => !escolhidas.has(p)).sort((a, b) => Math.abs(a - alvoI) - Math.abs(b - alvoI) || b - a)[0];
    if (livre !== undefined) escolhidas.add(livre);
  }
  return Array.from(escolhidas).sort((a, b) => b - a);
}

/** Flacidez corporal: 2 profundidades = 4,5 e 1,5; 3 = 4,5, 3,0 e 1,5. */
export function profundidadesFlacidez(quantidade: number): number[] {
  return quantidade >= 3 ? [4.5, 3, 1.5] : [4.5, 1.5];
}

export interface AreaCorporal {
  nome: string;
  tipo: "flacidez" | "gordura";
  quadrantes: number;
  profundidades: number;
  disparosPorProfundidade: number;
  adipometro?: number;
  /** Dois lados (braços, flancos...): linha com direito e esquerdo. */
  bilateral?: boolean;
  /** Região do boneco (CATALOGO_CORPORAL): vira a imagem da área no planejador. */
  regiao?: string;
}

export interface EscolhaPlanejamento {
  areas: string[];
  saldo?: number | null;
  papada?: { adipometro: number; profundidades: number; disparos: number } | null;
  corporais?: AreaCorporal[];
  queixa?: string | null;
  paciente?: string | null;
}

export interface PlanejamentoMontado {
  estado: EstadoPlanejador;
  resumo: { area: string; total: number }[];
  total: number;
  sobra: number;
  avisos: string[];
}

const fx = (p: number) => p.toFixed(1);

/**
 * Monta o planejamento pelas regras: papada e corporal com a conta fixa; o
 * resto do saldo dividido igual entre as profundidades e lados das áreas do
 * rosto, sem passar do máximo de cada uma (o que não cabe vira "sobra").
 * Sem saldo, cada linha do rosto vai no máximo.
 */
export function montarPlanejamento(e: EscolhaPlanejamento): PlanejamentoMontado {
  const DATA: Record<string, unknown[]> = {};
  const customAreas: Record<string, unknown>[] = [];
  const resumo: { area: string; total: number }[] = [];
  const avisos: string[] = [];
  let usado = 0;
  const sel = new Set(e.areas);
  const opts = ["1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "6.0", "7.0", "8.0", "9.0", "10.0", "11.0", "12.0", "13.0"];

  const idDaArea = (id: string, nome: string, regiao: "facial" | "corporal", bilateral: boolean, img?: string) => {
    if (AREAS_FIXAS_PLANEJADOR.has(id)) return id;
    const novo = `custom_${customAreas.length + 1}`;
    customAreas.push({ id: novo, nome, bilateral, opts, regiao, ...(img ? { img } : {}) });
    return novo;
  };

  // Papada pelo adipômetro.
  if (sel.has("papada") && e.papada && e.papada.adipometro > 0 && e.papada.disparos > 0) {
    const profs = profundidadesPapada(e.papada.adipometro, e.papada.profundidades);
    const partes = dividirDisparos(e.papada.disparos, profs.length);
    DATA.papada = profs.map((p, i) => ({ prof: fx(p), disp: partes[i] }));
    const t = partes.reduce((a, b) => a + b, 0);
    resumo.push({ area: "Submandibular e Papada", total: t });
    usado += t;
    if (profs.length < e.papada.profundidades) avisos.push(`Papada: com ${e.papada.adipometro} mm só cabem ${profs.length} profundidade(s).`);
  } else if (sel.has("papada")) {
    avisos.push("Papada marcada sem adipômetro ou disparos: ficou de fora.");
  }

  // Corporal: por quadrante, disparos por profundidade entre 3.200 e 4.000.
  for (const c of e.corporais ?? []) {
    const nome = c.nome.trim();
    if (!nome) continue;
    const q = Math.max(1, Math.round(c.quadrantes) || 1);
    const disp = Math.min(DISPAROS_CORPORAL.max, Math.max(DISPAROS_CORPORAL.min, Math.round(c.disparosPorProfundidade) || DISPAROS_CORPORAL.min));
    const profs = c.tipo === "gordura" ? profundidadesGordura(c.adipometro ?? 0, c.profundidades) : profundidadesFlacidez(c.profundidades);
    if (c.tipo === "gordura" && profs.length < 3) avisos.push(`${nome}: com ${c.adipometro ?? 0} mm no adipômetro só cabem ${profs.length} profundidade(s) de gordura.`);
    const id = idDaArea("", nome, "corporal", !!c.bilateral, urlBoneco(c.regiao || "corpo"));
    DATA[id] = profs.map((p) => (c.bilateral ? { prof: fx(p), dispD: disp, dispE: disp, quad: q } : { prof: fx(p), disp, quad: q }));
    const t = profs.length * disp * q * (c.bilateral ? 2 : 1);
    resumo.push({ area: `${nome} (${q} quad.)`, total: t });
    usado += t;
  }

  // Rosto: divide o restante igual entre as vagas (profundidade x lado).
  const rosto = CATALOGO_AREAS.filter((a) => sel.has(a.id) && a.id !== "papada");
  type Vaga = { area: string; prof: number; lado: "D" | "E" | "U"; teto: number; valor: number };
  const vagas: Vaga[] = [];
  for (const a of rosto) {
    const unica = AREA_UNICA.has(a.id);
    for (const p of profundidadesRosto(a.id)) {
      for (const lado of unica ? (["U"] as const) : (["D", "E"] as const)) {
        vagas.push({ area: a.id, prof: p, lado, teto: MAXIMO_LINHA[a.id] ?? 1200, valor: 0 });
      }
    }
  }
  const saldo = e.saldo && e.saldo > 0 ? e.saldo : null;
  if (saldo !== null && usado > saldo) avisos.push(`Papada e corporal (${usado.toLocaleString("pt-BR")}) já passam do saldo de ${saldo.toLocaleString("pt-BR")}.`);
  let resta = saldo === null ? Infinity : Math.max(0, saldo - usado);
  let abertas = vagas.slice();
  while (abertas.length && resta > 0) {
    const parte = resta === Infinity ? Infinity : Math.floor(resta / abertas.length / 10) * 10;
    if (parte <= 0) break;
    const proximas: Vaga[] = [];
    for (const v of abertas) {
      const add = Math.min(parte, v.teto - v.valor);
      v.valor += add;
      if (resta !== Infinity) resta -= add;
      if (v.valor < v.teto) proximas.push(v);
    }
    if (proximas.length === abertas.length && parte !== Infinity && parte < 10) break;
    abertas = proximas;
  }
  for (const a of rosto) {
    const unica = AREA_UNICA.has(a.id);
    const linhas = profundidadesRosto(a.id).map((p) => {
      const val = (lado: string) => vagas.find((v) => v.area === a.id && v.prof === p && v.lado === lado)?.valor ?? 0;
      return unica ? { prof: fx(p), disp: val("U") } : { prof: fx(p), dispD: val("D"), dispE: val("E") };
    });
    const t = linhas.reduce((s, l: any) => s + (l.disp ?? 0) + (l.dispD ?? 0) + (l.dispE ?? 0), 0);
    const id = idDaArea(a.id, NOME_EXTRA[a.id] ?? a.nome, "facial", !unica);
    DATA[id] = linhas;
    resumo.push({ area: a.nome, total: t });
    usado += t;
  }

  const sobra = saldo === null ? 0 : Math.max(0, saldo - usado);
  if (sobra >= 10 && rosto.length) avisos.push(`Sobraram ${sobra.toLocaleString("pt-BR")} disparos: as áreas do rosto chegaram no máximo.`);
  const nomesCorporais = (e.corporais ?? []).map((c) => c.nome.trim()).filter(Boolean);
  const proc = [nomeProcedimento(e.areas), ...nomesCorporais].filter(Boolean).join(" + ");
  const estado: EstadoPlanejador = {
    DATA,
    customAreas,
    customSeq: customAreas.length,
    saldoTotal: String(saldo ?? usado),
    procNome: proc,
    ...(e.queixa ? { queixa: e.queixa } : {}),
    ...(e.paciente ? { paciente: e.paciente } : {}),
  };
  return { estado, resumo, total: usado, sobra, avisos };
}
