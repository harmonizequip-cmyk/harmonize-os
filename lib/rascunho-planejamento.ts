// Rascunho local do Planejador HIPRO: cada mudança fica guardada no celular
// (localStorage) até o banco confirmar o salvamento daquele estado. Assim,
// sinal fraco, troca de app ou aba morta pelo Android não perdem a
// distribuição de disparos. Aqui só as regras puras (testadas em
// rascunho-planejamento.test.ts); a leitura e a gravação ficam no editor.
import { temConteudo, type EstadoPlanejador } from "./planejamento";
import { normalizarPlano, paraEstado, totalDistribuido, usadoEmAnteriores } from "./planejador";

export const PREFIXO_RASCUNHO = "harmonize-planejamento-rascunho-";

/** Rascunho mais velho que isto é jogado fora ao abrir. */
export const VALIDADE_RASCUNHO_MS = 30 * 86400000;

export type Rascunho = {
  v: 1;
  estado: EstadoPlanejador;
  cliente: string;
  evento: string;
  /** Conta das mudanças desde que o editor abriu. */
  versao: number;
  /** Hora (do aparelho) da última mudança. */
  em: number;
  /** Impressão do estado do servidor sobre o qual o rascunho foi feito (null = não se sabe). */
  base: string | null;
};

/** Chave do rascunho: por plano salvo, ou pelo "novo" da mesma cliente e atendimento. */
export function chaveRascunho(id: string | null, cliente?: string | null, evento?: string | null): string {
  if (id) return `${PREFIXO_RASCUNHO}${id}`;
  return `${PREFIXO_RASCUNHO}novo-${cliente || "sem"}-${evento || "sem"}`;
}

function canonico(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .filter((k) => o[k] !== undefined)
        .sort()
        .map((k) => [k, canonico(o[k])])
    );
  }
  return v;
}

/**
 * Impressão do estado para comparar o que está no celular com o que está no
 * banco. Passa pelo mesmo normalizador do editor e ignora paciente e
 * pacienteId, que o banco ajusta ao salvar (nome do cadastro e id da ficha).
 */
export function impressao(estado: EstadoPlanejador | null | undefined, hoje = "2000-01-01"): string {
  const { paciente: _p, pacienteId: _i, ...resto } = paraEstado(normalizarPlano(estado ?? {}, hoje)) as Record<string, unknown>;
  return JSON.stringify(canonico(resto));
}

/** Lê o texto guardado; qualquer coisa estranha vira null. */
export function lerRascunho(texto: string | null | undefined): Rascunho | null {
  if (!texto) return null;
  try {
    const r = JSON.parse(texto) as Partial<Rascunho>;
    if (!r || r.v !== 1 || !r.estado || typeof r.estado !== "object" || Array.isArray(r.estado)) return null;
    if (typeof r.em !== "number" || !Number.isFinite(r.em)) return null;
    return {
      v: 1,
      estado: r.estado as EstadoPlanejador,
      cliente: typeof r.cliente === "string" ? r.cliente : "",
      evento: typeof r.evento === "string" ? r.evento : "",
      versao: typeof r.versao === "number" ? r.versao : 0,
      em: r.em,
      base: typeof r.base === "string" ? r.base : null,
    };
  } catch {
    return null;
  }
}

export type DecisaoRascunho = "nada" | "restaurar" | "perguntar" | "descartar";

/**
 * O que fazer com o rascunho ao abrir o editor.
 * - Plano salvo: restaura sozinho quando o rascunho é diferente do banco e
 *   foi feito em cima da versão que está no banco (impressão igual à base) ou,
 *   sem essa certeza, quando é mais novo que o updated_at do banco. Se o banco
 *   já tem o mesmo conteúdo, ou tem uma versão mais nova, descarta.
 * - Plano novo: só pergunta ("Continuar de onde parou?") se houver conteúdo,
 *   porque vários pacientes da mesma cliente e atendimento usam a mesma chave.
 */
export function decidirRascunho(args: {
  rascunho: Rascunho | null;
  novo: boolean;
  servidorEstado?: EstadoPlanejador | null;
  servidorUpdatedAt?: string | null;
  agora: number;
}): DecisaoRascunho {
  const { rascunho: r, novo, agora } = args;
  if (!r) return "nada";
  if (agora - r.em > VALIDADE_RASCUNHO_MS) return "descartar";
  if (novo) {
    const p = normalizarPlano(r.estado);
    return temConteudo(r.estado, totalDistribuido(p) + usadoEmAnteriores(p)) ? "perguntar" : "descartar";
  }
  const doServidor = impressao(args.servidorEstado ?? {});
  if (impressao(r.estado) === doServidor) return "descartar";
  if (r.base !== null && r.base === doServidor) return "restaurar";
  const t = args.servidorUpdatedAt ? Date.parse(args.servidorUpdatedAt) : NaN;
  if (!Number.isFinite(t)) return r.base === null ? "restaurar" : "descartar";
  return r.em > t ? "restaurar" : "descartar";
}

/** Espera antes da próxima tentativa de salvar (tentativa 0 = primeira repetição). */
export function proximaEspera(tentativa: number): number {
  const passos = [2000, 5000, 10000, 20000];
  return tentativa >= 0 && tentativa < passos.length ? passos[tentativa] : 30000;
}

export type RascunhoOrfao = {
  chave: string;
  id: string;
  rascunho: Rascunho;
  paciente: string;
  total: number;
};

/**
 * Rascunhos de planos salvos que não existem mais no banco (o plano foi
 * apagado antes de o rascunho chegar lá) e que têm disparos: o celular ainda
 * guarda o trabalho, e a lista do Planejador oferece recuperar como plano novo.
 * Só planos salvos (chave com id), nunca os "novo-<cliente>-<evento>".
 */
export function rascunhosOrfaos(entradas: { chave: string; texto: string | null }[], idsExistentes: Set<string>, agora = Date.now()): RascunhoOrfao[] {
  const saida: RascunhoOrfao[] = [];
  for (const { chave, texto } of entradas) {
    if (!chave.startsWith(PREFIXO_RASCUNHO)) continue;
    const id = chave.slice(PREFIXO_RASCUNHO.length);
    if (!id || id.startsWith("novo-") || idsExistentes.has(id)) continue;
    const r = lerRascunho(texto);
    if (!r || agora - r.em > VALIDADE_RASCUNHO_MS) continue;
    const p = normalizarPlano(r.estado);
    const total = totalDistribuido(p) + usadoEmAnteriores(p);
    if (total <= 0) continue;
    const paciente = typeof r.estado.paciente === "string" ? r.estado.paciente.trim() : "";
    saida.push({ chave, id, rascunho: r, paciente, total });
  }
  return saida.sort((a, b) => b.rascunho.em - a.rascunho.em);
}
