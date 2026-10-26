// TEMPORÁRIO: remover junto com a tela /clientes/limpeza-leads quando o dono
// terminar a limpeza (ver "Pendências conhecidas" no CLAUDE.md).
//
// Regras puras da limpeza de leads em massa: quem pode entrar na lista, filtros,
// ordem, seleção (no máximo 200 por rodada), resumo e o arquivo de cópia baixado
// antes de apagar. Nada aqui fala com a rede.
//
// POR QUE A TELA SE PROTEGE SOZINHA: no banco real, o ramo 'clients' de
// delete_record_forever apaga em cascata locações, lançamentos e agenda (a
// migration de 03/10 recriou a função sem o bloqueio da Leva P.3). Então só entra
// na lista quem não tem nenhum vínculo de dinheiro, agenda, crédito, contrato,
// login ou planejamento, e antes de cada exclusão a prévia do banco é conferida de
// novo (motivoParaNaoApagar).

import { hojeLocal } from "./period";

export const LIMITE_RODADA = 200;

/** Vínculos que tiram o lead da lista (apagar levaria junto coisa que importa). */
export interface Vinculos {
  locacao: boolean;
  lancamento: boolean;
  agenda: boolean;
  credito: boolean;
  contrato: boolean;
  login: boolean;
  planejamento: boolean;
}

const ROTULO_VINCULO: Record<keyof Vinculos, string> = {
  locacao: "locação",
  lancamento: "lançamento ou pagamento",
  agenda: "reserva ou evento na agenda",
  credito: "crédito",
  contrato: "contrato",
  login: "acesso ao Planejador",
  planejamento: "planejamento",
};

export function motivosDeFora(v: Partial<Vinculos>): string[] {
  return (Object.keys(ROTULO_VINCULO) as (keyof Vinculos)[]).filter((k) => v[k]).map((k) => ROTULO_VINCULO[k]);
}

export interface LeadLimpeza {
  id: string;
  /** Nome do cadastro (campo "Nome"). */
  nome: string;
  /** Tratamento e primeiro nome, quando dá para tirar (lib/saudacao). */
  apelido: string | null;
  cidade: string | null;
  whatsapp: string | null;
  etapa: string | null;
  origem: string | null;
  /** Data de criação no calendário de Brasília (AAAA-MM-DD). */
  criadoEm: string | null;
  tarefas: number;
  anotacoes: number;
  envios: number;
  naoQuer: boolean;
  /** Quantas pessoas ela indicou (o "indicado por" delas fica vazio). */
  indicou: number;
  /** Linha completa do cadastro, para o arquivo de cópia. */
  cadastro: Record<string, unknown>;
}

export function temHistorico(l: Pick<LeadLimpeza, "tarefas" | "anotacoes" | "envios">): boolean {
  return l.tarefas > 0 || l.anotacoes > 0 || l.envios > 0;
}

export type Ordem = "nome" | "recentes" | "antigos" | "cidade" | "etapa";

export interface FiltrosLimpeza {
  busca: string;
  etapa: string;
  origem: string;
  semWhatsapp: boolean;
  semAtividade: boolean;
  criadosAntesDe: string;
  naoQuer: boolean;
  ordem: Ordem;
}

export const FILTROS_VAZIOS: FiltrosLimpeza = {
  busca: "",
  etapa: "",
  origem: "",
  semWhatsapp: false,
  semAtividade: false,
  criadosAntesDe: "",
  naoQuer: false,
  ordem: "nome",
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

export function temWhatsapp(l: Pick<LeadLimpeza, "whatsapp">): boolean {
  return digitos(l.whatsapp).length >= 8;
}

/** Data de criação (timestamptz) no calendário de Brasília. */
export function dataLocalDe(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : hojeLocal(d);
}

export function filtrarLeads(leads: LeadLimpeza[], f: FiltrosLimpeza): LeadLimpeza[] {
  const termo = semAcento(f.busca.trim());
  const termoDigitos = digitos(f.busca);
  const filtrados = leads.filter((l) => {
    if (termo) {
      const texto = semAcento(`${l.nome} ${l.apelido ?? ""} ${l.cidade ?? ""}`);
      const bateTexto = texto.includes(termo);
      const bateFone = termoDigitos.length >= 3 && digitos(l.whatsapp).includes(termoDigitos);
      if (!bateTexto && !bateFone) return false;
    }
    if (f.etapa && (l.etapa ?? "") !== f.etapa) return false;
    if (f.origem) {
      if (f.origem === "__sem__" ? !!l.origem : l.origem !== f.origem) return false;
    }
    if (f.semWhatsapp && temWhatsapp(l)) return false;
    if (f.semAtividade && temHistorico(l)) return false;
    if (f.criadosAntesDe && !(l.criadoEm && l.criadoEm < f.criadosAntesDe)) return false;
    if (f.naoQuer && !l.naoQuer) return false;
    return true;
  });
  return ordenarLeads(filtrados, f.ordem);
}

export function ordenarLeads(leads: LeadLimpeza[], ordem: Ordem): LeadLimpeza[] {
  const porNome = (a: LeadLimpeza, b: LeadLimpeza) => a.nome.localeCompare(b.nome, "pt-BR") || a.id.localeCompare(b.id);
  const lista = [...leads];
  switch (ordem) {
    case "recentes":
      return lista.sort((a, b) => (b.criadoEm ?? "").localeCompare(a.criadoEm ?? "") || porNome(a, b));
    case "antigos":
      // Sem data vai para o fim.
      return lista.sort((a, b) => (a.criadoEm ?? "9999").localeCompare(b.criadoEm ?? "9999") || porNome(a, b));
    case "cidade":
      return lista.sort((a, b) => (a.cidade ?? "￿").localeCompare(b.cidade ?? "￿", "pt-BR") || porNome(a, b));
    case "etapa":
      return lista.sort((a, b) => (a.etapa ?? "").localeCompare(b.etapa ?? "") || porNome(a, b));
    default:
      return lista.sort(porNome);
  }
}

/** Liga/desliga um lead. Não passa do limite da rodada. */
export function alternarSelecao(sel: ReadonlySet<string>, id: string, limite = LIMITE_RODADA): { selecao: Set<string>; recusado: boolean } {
  const nova = new Set(sel);
  if (nova.has(id)) {
    nova.delete(id);
    return { selecao: nova, recusado: false };
  }
  if (nova.size >= limite) return { selecao: nova, recusado: true };
  nova.add(id);
  return { selecao: nova, recusado: false };
}

/** Marca os filtrados (na ordem da tela) até completar o limite; diz quantos ficaram de fora. */
export function marcarFiltrados(
  sel: ReadonlySet<string>,
  filtrados: Pick<LeadLimpeza, "id">[],
  limite = LIMITE_RODADA
): { selecao: Set<string>; cortados: number } {
  const nova = new Set(sel);
  let cortados = 0;
  for (const l of filtrados) {
    if (nova.has(l.id)) continue;
    if (nova.size >= limite) {
      cortados++;
      continue;
    }
    nova.add(l.id);
  }
  return { selecao: nova, cortados };
}

/** Tira da seleção quem não está mais na lista (apagado ou ganhou vínculo). */
export function podarSelecao(sel: ReadonlySet<string>, leads: Pick<LeadLimpeza, "id">[]): Set<string> {
  const ids = new Set(leads.map((l) => l.id));
  return new Set([...sel].filter((id) => ids.has(id)));
}

export interface ResumoExclusao {
  total: number;
  comTarefas: number;
  comAnotacoes: number;
  comEnvios: number;
  naoQuer: number;
  tarefas: number;
  anotacoes: number;
  envios: number;
  indicaram: number;
}

export function resumoExclusao(leads: LeadLimpeza[]): ResumoExclusao {
  const r: ResumoExclusao = { total: leads.length, comTarefas: 0, comAnotacoes: 0, comEnvios: 0, naoQuer: 0, tarefas: 0, anotacoes: 0, envios: 0, indicaram: 0 };
  for (const l of leads) {
    if (l.tarefas > 0) r.comTarefas++;
    if (l.anotacoes > 0) r.comAnotacoes++;
    if (l.envios > 0) r.comEnvios++;
    if (l.naoQuer) r.naoQuer++;
    if (l.indicou > 0) r.indicaram++;
    r.tarefas += l.tarefas;
    r.anotacoes += l.anotacoes;
    r.envios += l.envios;
  }
  return r;
}

/** Prévia devolvida por preview_exclusao (só o que a guarda usa). */
export interface PreviaExclusao {
  locacoes?: number;
  lancamentos?: number;
  eventos?: number;
  taxas?: number;
}

/**
 * Conferência final antes de cada delete_record_forever. A função do banco apaga
 * em cascata locação, lançamento e agenda; aqui qualquer um deles barra.
 * Devolve o motivo (para o relatório) ou null quando pode apagar.
 */
export function motivoParaNaoApagar(p: PreviaExclusao | null | undefined): string | null {
  if (!p) return "O banco não devolveu a prévia da exclusão; nada foi apagado.";
  const partes: string[] = [];
  if (Number(p.locacoes ?? 0) > 0) partes.push(`${p.locacoes} locação(ões)`);
  if (Number(p.lancamentos ?? 0) > 0 || Number(p.taxas ?? 0) > 0) partes.push("lançamento ou pagamento");
  if (Number(p.eventos ?? 0) > 0) partes.push(`${p.eventos} evento(s) na agenda`);
  if (!partes.length) return null;
  return `Pulado: agora tem ${partes.join(", ")}. A exclusão apagaria isso junto.`;
}

/** Mensagem do erro do banco, sem esconder o texto original. */
export function explicarErro(e: { message?: string; code?: string; details?: string } | null | undefined): string {
  const msg = e?.message?.trim() || "Erro sem mensagem.";
  if (e?.code === "23503") return `Tem ligação em outra tabela que impede apagar (${msg}).`;
  return msg;
}

export interface CopiaLeads {
  gerado_em: string;
  motivo: string;
  total: number;
  leads: { cadastro: Record<string, unknown>; contagens: { tarefas: number; anotacoes: number; envios_campanha: number; nao_quer_receber: boolean; indicou: number } }[];
}

export function montarCopia(leads: LeadLimpeza[], agora: Date = new Date()): CopiaLeads {
  return {
    gerado_em: agora.toISOString(),
    motivo: "Cópia dos leads selecionados antes da exclusão em massa (tela temporária /clientes/limpeza-leads).",
    total: leads.length,
    leads: leads.map((l) => ({
      cadastro: { ...l.cadastro },
      contagens: { tarefas: l.tarefas, anotacoes: l.anotacoes, envios_campanha: l.envios, nao_quer_receber: l.naoQuer, indicou: l.indicou },
    })),
  };
}

export function textoCopia(leads: LeadLimpeza[], agora: Date = new Date()): string {
  return JSON.stringify(montarCopia(leads, agora), null, 2);
}

/** copia-leads-AAAA-MM-DD-HHMMSS.json, no horário de Brasília. */
export function nomeArquivoCopia(agora: Date = new Date()): string {
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    .format(agora)
    .replace(/:/g, "");
  return `copia-leads-${hojeLocal(agora)}-${hora}.json`;
}
