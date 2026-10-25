// ============================================================
// CAMPANHAS: regras puras (público, mensagem, limite diário).
//
// Uma campanha tem uma arte fixa e uma mensagem e é enviada UM A UM pelo
// WhatsApp: nada sai sozinho, o dono toca em cada contato. Tabelas
// campanhas e campanha_envios (migrations/2026-10-25-campanhas.sql).
//
// Público: parte da carteira do Relacionamento (lib/relacionamento.ts, que já
// tira teste e desqualificado) e aplica os filtros guardados em
// campanhas.filtros. Sempre fora: sem WhatsApp, quem já está nesta campanha
// (qualquer situação) e quem marcou "não quer receber" em qualquer campanha.
//
// Mensagem: só {saudacao}, {nome} e {cidade}. Diferente dos modelos de
// Configurações > Mensagens, aqui o texto é do dono: variável errada não volta
// a padrão nenhum, bloqueia o salvar e mostra o erro.
// ============================================================

import { hojeLocal } from "./period";
import type { Classe, PessoaClassificada } from "./relacionamento";
import { variaveisDaPessoa } from "./saudacao";

export type StatusEnvio = "enviado" | "respondeu" | "agendou" | "nao_quer" | "pulado";

export const STATUS_ENVIO: StatusEnvio[] = ["enviado", "respondeu", "agendou", "nao_quer", "pulado"];

export const ROTULO_STATUS: Record<StatusEnvio, string> = {
  enviado: "Enviado",
  respondeu: "Respondeu",
  agendou: "Agendou",
  nao_quer: "Não quer receber",
  pulado: "Pulado",
};

export type TipoPublico = "clientes" | "leads" | "ambos";

export interface FiltrosCampanha {
  tipo: TipoPublico;
  /** Classes do Relacionamento; vazio = todas do tipo escolhido. */
  classes: Classe[];
  /** Só quem já passou da cadência do Relacionamento ("hora de chamar"). */
  soHoraDeChamar: boolean;
  /** Tira quem tem atendimento marcado de hoje em diante. */
  excluirComReserva: boolean;
  /** Tirados à mão da lista (caixinha desmarcada). */
  excluidos: string[];
}

export const FILTROS_PADRAO: FiltrosCampanha = {
  tipo: "ambos",
  classes: [],
  soHoraDeChamar: false,
  excluirComReserva: true,
  excluidos: [],
};

export const CLASSES_CLIENTE: Classe[] = ["em_risco", "nova", "ativa", "agendada", "sumida"];
export const CLASSES_LEAD: Classe[] = ["quente", "morna", "fria"];
const TODAS_CLASSES = new Set<Classe>([...CLASSES_CLIENTE, ...CLASSES_LEAD]);

export const LIMITE_DIARIO_PADRAO = 15;
export const LIMITE_DIARIO_MIN = 1;
export const LIMITE_DIARIO_MAX = 100;
export const TAMANHO_MAXIMO_MENSAGEM_CAMPANHA = 2000;

/** Lê o jsonb do banco; o que faltar ou vier errado fica no padrão. */
export function lerFiltros(bruto: unknown): FiltrosCampanha {
  const r = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const tipo: TipoPublico = r.tipo === "clientes" || r.tipo === "leads" || r.tipo === "ambos" ? r.tipo : FILTROS_PADRAO.tipo;
  const classes = Array.isArray(r.classes)
    ? Array.from(new Set(r.classes.filter((c): c is Classe => typeof c === "string" && TODAS_CLASSES.has(c as Classe))))
    : [];
  const excluidos = Array.isArray(r.excluidos)
    ? Array.from(new Set(r.excluidos.filter((x): x is string => typeof x === "string" && x.length > 0)))
    : [];
  return {
    tipo,
    classes,
    soHoraDeChamar: typeof r.soHoraDeChamar === "boolean" ? r.soHoraDeChamar : FILTROS_PADRAO.soHoraDeChamar,
    excluirComReserva: typeof r.excluirComReserva === "boolean" ? r.excluirComReserva : FILTROS_PADRAO.excluirComReserva,
    excluidos,
  };
}

export function limiteValido(n: unknown): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return LIMITE_DIARIO_PADRAO;
  return Math.min(LIMITE_DIARIO_MAX, Math.max(LIMITE_DIARIO_MIN, v));
}

export function ehClasseDeCliente(c: Classe): boolean {
  return CLASSES_CLIENTE.includes(c);
}

/** WhatsApp com pelo menos DDD + número (10 dígitos). */
export function temWhatsApp(telefone: string | null | undefined): boolean {
  return (telefone ?? "").replace(/\D/g, "").length >= 10;
}

/** Classes que a tela oferece para o tipo escolhido. */
export function classesDoTipo(tipo: TipoPublico): Classe[] {
  return tipo === "clientes" ? CLASSES_CLIENTE : tipo === "leads" ? CLASSES_LEAD : [...CLASSES_CLIENTE, ...CLASSES_LEAD];
}

/**
 * Quem a campanha alcança pelos filtros (antes das caixinhas desmarcadas),
 * em ordem de prioridade do Relacionamento (maior primeiro, depois o nome).
 * `jaNaCampanha`: quem já tem envio nesta campanha (qualquer situação).
 * `naoQuer`: quem marcou "não quer receber" em qualquer campanha.
 */
export function candidatosDaCampanha(
  pessoas: PessoaClassificada[],
  filtros: FiltrosCampanha,
  opcoes: { jaNaCampanha: Set<string>; naoQuer: Set<string> }
): PessoaClassificada[] {
  const doTipo = new Set(classesDoTipo(filtros.tipo));
  const escolhidas = filtros.classes.filter((c) => doTipo.has(c));
  const classes = escolhidas.length ? new Set(escolhidas) : doTipo;
  return pessoas
    .filter((p) => {
      if (!temWhatsApp(p.whatsapp)) return false;
      if (p.stage === "desqualificado") return false;
      if (opcoes.jaNaCampanha.has(p.id)) return false;
      if (opcoes.naoQuer.has(p.id)) return false;
      if (!classes.has(p.classe)) return false;
      if (filtros.soHoraDeChamar && !p.devida) return false;
      if (filtros.excluirComReserva && p.proximaReserva) return false;
      return true;
    })
    .sort((a, b) => b.prioridade - a.prioridade || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** A fila de envio: os candidatos menos os tirados à mão. */
export function filaDaCampanha(candidatos: PessoaClassificada[], filtros: FiltrosCampanha): PessoaClassificada[] {
  const fora = new Set(filtros.excluidos);
  return candidatos.filter((p) => !fora.has(p.id));
}

/** Liga/desliga uma pessoa na lista (grava em filtros.excluidos). */
export function alternarExcluido(filtros: FiltrosCampanha, id: string): FiltrosCampanha {
  const fora = new Set(filtros.excluidos);
  if (fora.has(id)) fora.delete(id);
  else fora.add(id);
  return { ...filtros, excluidos: Array.from(fora) };
}

/** Só guarda tirados à mão que ainda são candidatos (a lista não cresce sem fim). */
export function limparExcluidos(filtros: FiltrosCampanha, candidatos: PessoaClassificada[]): FiltrosCampanha {
  const ids = new Set(candidatos.map((p) => p.id));
  return { ...filtros, excluidos: filtros.excluidos.filter((id) => ids.has(id)) };
}

// ---------- mensagem ----------

export type VariavelCampanha = "saudacao" | "nome" | "cidade";

export const VARIAVEIS_CAMPANHA: Record<VariavelCampanha, { rotulo: string; dica: string }> = {
  saudacao: { rotulo: "Saudação", dica: "\"Olá, Dra. Simone!\" (tratamento e primeiro nome; sem nome, \"Olá!\")" },
  nome: { rotulo: "Nome", dica: "Tratamento e primeiro nome, sem o \"Olá\"" },
  cidade: { rotulo: "Cidade", dica: "Cidade do cadastro (pode ficar vazia)" },
};

export const EXEMPLO_PESSOA_CAMPANHA: Record<VariavelCampanha, string> = {
  saudacao: "Olá, Dra. Simone!",
  nome: "Dra. Simone",
  cidade: "Caruaru",
};

/** Texto neutro, sem preço nem desconto (o dono completa). */
export const EXEMPLO_BLACK_FRIDAY =
  "{saudacao} Estamos antecipando a Black Friday da Harmonize com condições especiais e apenas 5 datas disponíveis. Posso te mandar os detalhes? 😊";

const TOKEN = /\{([^{}]*)\}/g;

/** Problemas do texto (vazio = pode salvar), em português para a tela. */
export function problemasDaMensagem(texto: string): string[] {
  const problemas: string[] = [];
  if (!texto.trim()) return ["Escreva a mensagem."];
  if (texto.length > TAMANHO_MAXIMO_MENSAGEM_CAMPANHA)
    problemas.push(`Passou de ${TAMANHO_MAXIMO_MENSAGEM_CAMPANHA.toLocaleString("pt-BR")} caracteres.`);
  const vistas = new Set<string>();
  for (const m of texto.matchAll(TOKEN)) {
    const nome = m[1];
    if (vistas.has(nome)) continue;
    vistas.add(nome);
    if (!(nome in VARIAVEIS_CAMPANHA)) problemas.push(nome.trim() ? `{${nome}} não existe. Use {saudacao}, {nome} ou {cidade}.` : "Tem chave vazia: {}.");
  }
  if (/[{}]/.test(texto.replace(TOKEN, ""))) problemas.push("Tem chave sem par: toda variável é {nome}, com as duas chaves.");
  return problemas;
}

/** "CAMPINA GRANDE" vira "Campina Grande"; o que já tem minúscula fica como está. */
export function cidadeParaMensagem(cidade: string | null | undefined): string {
  const t = (cidade ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  if (t !== t.toLocaleUpperCase("pt-BR")) return t;
  const pequenas = new Set(["de", "da", "do", "das", "dos", "e"]);
  return t
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((p, i) => (i > 0 && pequenas.has(p) ? p : p.charAt(0).toLocaleUpperCase("pt-BR") + p.slice(1)))
    .join(" ");
}

/**
 * Troca as variáveis. Variável sem valor some sem deixar espaço duplo (mesma
 * regra de lib/mensagens-modelos.ts). Só chame com texto sem problemas.
 */
export function renderizarComValores(texto: string, valores: Partial<Record<VariavelCampanha, string | null | undefined>>): string {
  let saida = "";
  let ultimo = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const inicio = m.index ?? 0;
    saida += texto.slice(ultimo, inicio);
    ultimo = inicio + m[0].length;
    const valor = valores[m[1] as VariavelCampanha] ?? "";
    if (valor) {
      saida += valor;
      continue;
    }
    const depois = texto.charAt(ultimo);
    if (saida.endsWith(" ") && (depois === "" || /[\s.,;:!?]/.test(depois))) saida = saida.slice(0, -1);
  }
  return saida + texto.slice(ultimo);
}

/** Mensagem pronta para a pessoa ({saudacao} = saudacaoCurta, regra fixa). */
export function mensagemParaPessoa(
  texto: string,
  p: { nome: string; treatment: string | null; displayName: string | null; cidade: string | null }
): string {
  const v = variaveisDaPessoa({ name: p.nome, treatment: p.treatment, displayName: p.displayName });
  return renderizarComValores(texto, { saudacao: v.saudacao, nome: v.nome, cidade: cidadeParaMensagem(p.cidade) });
}

export function previaDaMensagem(texto: string): string {
  return renderizarComValores(texto, EXEMPLO_PESSOA_CAMPANHA);
}

// ---------- envios e limite diário ----------

export interface EnvioCampanha {
  campanha_id: string;
  client_id: string;
  status: StatusEnvio;
  mensagem?: string | null;
  enviado_em: string | null;
  atualizado_em?: string | null;
}

/**
 * Quantos envios desta campanha saíram hoje (dia de Brasília, por hojeLocal).
 * Conta a hora do envio, então mudar depois para "respondeu" não devolve vaga.
 */
export function enviadosNoDia(envios: Pick<EnvioCampanha, "enviado_em">[], hoje: string = hojeLocal()): number {
  return envios.filter((e) => e.enviado_em && hojeLocal(new Date(e.enviado_em)) === hoje).length;
}

export function situacaoDoLimite(enviadosHoje: number, limite: number): { enviados: number; limite: number; vagas: number; atingido: boolean } {
  const l = limiteValido(limite);
  return { enviados: enviadosHoje, limite: l, vagas: Math.max(0, l - enviadosHoje), atingido: enviadosHoje >= l };
}

export function contarPorStatus(envios: Pick<EnvioCampanha, "status">[]): Record<StatusEnvio, number> {
  const r: Record<StatusEnvio, number> = { enviado: 0, respondeu: 0, agendou: 0, nao_quer: 0, pulado: 0 };
  for (const e of envios) if (e.status in r) r[e.status] += 1;
  return r;
}

/** Quem recebeu de fato (tem hora de envio), independente do que veio depois. */
export function totalRecebidos(envios: Pick<EnvioCampanha, "enviado_em">[]): number {
  return envios.filter((e) => !!e.enviado_em).length;
}
