// Histórico do paciente (visto pela cliente, que aluga o HIPRO, e pelo dono):
// junta os planejamentos do mesmo paciente e monta a linha do tempo com cada
// sessão (as fechadas e a aberta). Só contas, sem tela.

import { contaDaSessao, normalizarPlano, planoDaSessao, todasAreas, totalArea, type Plano } from "./planejador";
import type { EstadoPlanejador } from "./planejamento";

/** Minúsculas, sem acento, espaços colapsados: "  JOÃO  da Silva " e "joao da silva" são o mesmo paciente. */
export function normalizarNome(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function chavePaciente(clientId: string | null | undefined, paciente: string | null | undefined): string {
  return `${clientId ?? ""}|${normalizarNome(paciente)}`;
}

/** Todos os planejamentos do mesmo paciente (mesma cliente e mesmo nome normalizado) do alvo. */
export function planosDoPaciente<T extends { client_id: string | null; paciente: string | null }>(lista: T[], alvo: T): T[] {
  const k = chavePaciente(alvo.client_id, alvo.paciente);
  return lista.filter((p) => chavePaciente(p.client_id, p.paciente) === k);
}

export interface EntradaHistorico {
  id: string;
  estado: EstadoPlanejador | null;
  data: string | null;
  data_retorno: string | null;
  procedimento: string | null;
  saldo_total: number;
  total_disparos: number;
  updated_at: string;
}

export interface AreaSessao {
  nome: string;
  total: number;
}

export interface SessaoHistorico {
  planoId: string;
  /** Número da sessão dentro do planejamento (1 = primeira). */
  n: number;
  /** Quantas sessões o planejamento tem. */
  sessoes: number;
  /** AAAA-MM-DD ("" se não tem data). */
  data: string;
  procedimento: string;
  /** Disparos distribuídos nesta sessão. */
  total: number;
  areas: AreaSessao[];
  /** Retorno marcado (da sessão aberta) ou a data da sessão seguinte (das fechadas). */
  retorno: string | null;
  /** Pacote inteiro do planejamento. */
  pacote: number;
  /** Disparos que ficam para as próximas sessões depois desta (0 na última). */
  saldoParaProxima: number;
  /** Sessão ainda aberta (a atual do planejamento). */
  aberta: boolean;
  updatedAt: string;
}

const dia = (v: string | null | undefined) => (v ?? "").slice(0, 10);

/** As sessões de um planejamento: as fechadas e a aberta, da primeira para a última. */
export function sessoesDoPlano(e: EntradaHistorico): SessaoHistorico[] {
  const plano: Plano = normalizarPlano(e.estado);
  const numeros = [...plano.sessoesAnteriores.map((x) => x.n), plano.sessaoAtual];
  const procedimento = plano.procNome || e.procedimento || "";
  const datas = new Map<number, string>();
  for (const n of numeros) datas.set(n, dia(planoDaSessao(plano, n)?.data));
  return numeros.map((n, i) => {
    const visao = planoDaSessao(plano, n)!;
    const conta = contaDaSessao(plano, n);
    const aberta = n === plano.sessaoAtual;
    const proxima = numeros[i + 1];
    const retorno = aberta ? dia(plano.dataRetorno) || dia(e.data_retorno) || null : (proxima !== undefined ? datas.get(proxima) || null : null);
    return {
      planoId: e.id,
      n,
      sessoes: plano.sessoesTotal,
      data: datas.get(n) || (aberta ? dia(e.data) : ""),
      procedimento,
      total: conta.nesta,
      areas: todasAreas(visao)
        .map((a) => ({ nome: a.nome, total: totalArea(visao, a) }))
        .filter((a) => a.total > 0),
      retorno,
      pacote: conta.pacote,
      saldoParaProxima: conta.ultima ? 0 : Math.max(0, conta.resta),
      aberta,
      updatedAt: e.updated_at,
    };
  });
}

/** Linha do tempo de um conjunto de planejamentos: da sessão mais recente para a mais antiga. */
export function montarLinhaDoTempo(entradas: EntradaHistorico[]): SessaoHistorico[] {
  return entradas
    .flatMap(sessoesDoPlano)
    .sort((a, b) => b.data.localeCompare(a.data) || b.updatedAt.localeCompare(a.updatedAt) || b.n - a.n);
}

export interface FiltroHistorico {
  de?: string;
  ate?: string;
  texto?: string;
}

/** Filtra por período (AAAA-MM-DD, inclusivo) e texto (procedimento ou nome de área, sem acento). */
export function filtrarSessoes(sessoes: SessaoHistorico[], f: FiltroHistorico): SessaoHistorico[] {
  const t = normalizarNome(f.texto);
  return sessoes.filter((s) => {
    if (f.de && (!s.data || s.data < f.de)) return false;
    if (f.ate && (!s.data || s.data > f.ate)) return false;
    if (!t) return true;
    return normalizarNome(s.procedimento).includes(t) || s.areas.some((a) => normalizarNome(a.nome).includes(t));
  });
}

export interface ResumoHistorico {
  sessoes: number;
  /** Disparos já distribuídos em todas as sessões de todos os planejamentos. */
  usados: number;
  /** Quanto resta dos pacotes, somando todos os planejamentos (0 nos que não têm saldo definido). */
  saldoRestante: number;
  planejamentos: number;
}

/** Números do topo: sessões feitas, disparos usados e o que resta dos pacotes (todos os planejamentos). */
export function resumirHistorico(entradas: EntradaHistorico[]): ResumoHistorico {
  const sessoes = entradas.flatMap(sessoesDoPlano);
  const usados = sessoes.reduce((t, s) => t + s.total, 0);
  let saldoRestante = 0;
  for (const e of entradas) {
    const pacote = Number(normalizarPlano(e.estado).saldoTotal) || 0;
    if (!pacote) continue;
    const feitos = sessoesDoPlano(e).reduce((t, s) => t + s.total, 0);
    saldoRestante += Math.max(0, pacote - feitos);
  }
  return { sessoes: sessoes.length, usados, saldoRestante, planejamentos: entradas.length };
}

/**
 * Saldo que sobra para a próxima sessão, pelas colunas leves da lista: o pacote (saldo_total)
 * menos o que já foi distribuído (total_disparos, cumulativo). Só conta quando ainda há sessão pela frente.
 */
export function saldoParaProximaSessao(p: { saldo_total: number; total_disparos: number; sessoes_total?: number | null; sessao_atual?: number | null }): number {
  const sessoes = p.sessoes_total ?? 1;
  const atual = p.sessao_atual ?? 1;
  if (atual >= sessoes) return 0;
  return Math.max(0, (p.saldo_total || 0) - (p.total_disparos || 0));
}
