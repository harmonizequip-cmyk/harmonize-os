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
  { id: "terco_medio", nome: "Terço médio", grupo: "face" },
  { id: "nasolabial", nome: "Nasolabial", grupo: "face" },
  { id: "perioral_sup", nome: "Perioral Superior", grupo: "face", pequena: true },
  { id: "perioral_inf", nome: "Perioral Inferior", grupo: "face", pequena: true },
  { id: "mento", nome: "Mento", grupo: "face", pequena: true },
  { id: "jowls", nome: "Jowls", grupo: "face" },
  { id: "arcomandibular", nome: "Arco Mandibular", grupo: "face" },
  { id: "submandibular", nome: "Submandibular", grupo: "fora" },
  { id: "papada", nome: "Papada", grupo: "fora" },
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
