// Planejador HIPRO (public/ferramentas/planejador.html) dentro do app: o
// estado é o mesmo objeto que o planejador salvava no aparelho; aqui ficam
// as contas da lista e o que decide quando vale guardar no banco.

export const PREFIXO_CHAVE = "harmonize_planejador_plano_";
export const chaveLocal = (id: string) => PREFIXO_CHAVE + id;

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
