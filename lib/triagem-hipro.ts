// Triagem de contraindicações do HIPRO (e-book, cap. 8 e 22), feita em
// "Colher assinaturas" antes da assinatura do paciente. Regras puras
// (testadas em triagem-hipro.test.ts): a lista de condições, a
// classificação (sem contraindicação, relativa avaliada, absoluta
// confirmada pela profissional), o registro guardado em
// assinaturas_sessao.triagem e o texto da ficha impressa.
//
// A triagem NÃO entra no conteudo_hash da assinatura (o hash é só do
// atendimento: lib/assinatura-sessao.ts, textoParaHash).

import { TERMO_RESUMO, TERMO_TEXTO, TERMO_VERSAO } from "./consentimento-hipro";

export type TipoContraindicacao = "absoluta" | "relativa";

export interface Contraindicacao {
  id: string;
  tipo: TipoContraindicacao;
  texto: string;
  /** Explicação curta embaixo da caixinha. */
  detalhe?: string;
}

export const CONTRAINDICACOES: readonly Contraindicacao[] = [
  { id: "gestante", tipo: "absoluta", texto: "Gestante ou lactante" },
  { id: "marcapasso", tipo: "absoluta", texto: "Marcapasso ou dispositivo eletrônico implantado" },
  { id: "cancer", tipo: "absoluta", texto: "Câncer ou neoplasia ativa" },
  { id: "feridas", tipo: "absoluta", texto: "Feridas abertas ou dermatite ativa na área" },
  { id: "metal", tipo: "absoluta", texto: "Prótese ou fio metálico na área" },
  { id: "pmma", tipo: "absoluta", texto: "PMMA ou fio definitivo inabsorvível na área" },
  { id: "autoimune", tipo: "absoluta", texto: "Doença autoimune descompensada", detalhe: "Por exemplo lúpus ou esclerodermia." },
  { id: "isotretinoina", tipo: "absoluta", texto: "Isotretinoína (Roacutan)", detalhe: "Em uso ou terminou há menos de 6 meses." },
  { id: "cronica", tipo: "absoluta", texto: "Doença crônica descompensada", detalhe: "Diabetes instável ou cardiopatia grave sem liberação médica." },
  { id: "anticoagulante", tipo: "relativa", texto: "Anticoagulante ou coagulopatia", detalhe: "Mais risco de manchas roxas." },
  { id: "preenchimento", tipo: "relativa", texto: "Preenchimento ou toxina na mesma área há menos de 4 meses" },
  { id: "queloide", tipo: "relativa", texto: "Histórico de queloide", detalhe: "Fazer disparo teste conservador em área não aparente." },
];

export type SituacaoTriagem = "sem" | "relativa" | "absoluta";

/** O que está marcado na tela. */
export interface RespostasTriagem {
  marcadas: Record<string, boolean>;
  disparoTeste: boolean;
  /** Relativa marcada: "Avaliado e liberado pela profissional". */
  relativaLiberada: boolean;
  /** Absoluta marcada: a profissional confirma que decidiu fazer mesmo assim. */
  absolutaConfirmada: boolean;
}

export const RESPOSTAS_VAZIAS: RespostasTriagem = { marcadas: {}, disparoTeste: false, relativaLiberada: false, absolutaConfirmada: false };

export interface ClassificacaoTriagem {
  situacao: SituacaoTriagem;
  absolutas: Contraindicacao[];
  relativas: Contraindicacao[];
  /** Pode seguir para o termo (relativa liberada e absoluta confirmada, quando houver). */
  podeSeguir: boolean;
  /** O que falta marcar para seguir. */
  falta: string | null;
  /** Frase do resultado (tela e impressão). */
  texto: string;
}

export function classificarTriagem(r: RespostasTriagem): ClassificacaoTriagem {
  const marcadas = CONTRAINDICACOES.filter((c) => r.marcadas[c.id]);
  const absolutas = marcadas.filter((c) => c.tipo === "absoluta");
  const relativas = marcadas.filter((c) => c.tipo === "relativa");
  const situacao: SituacaoTriagem = absolutas.length ? "absoluta" : relativas.length ? "relativa" : "sem";
  let falta: string | null = null;
  if (absolutas.length && !r.absolutaConfirmada) falta = "Contraindicação absoluta marcada: só siga com a confirmação da profissional.";
  else if (relativas.length && !absolutas.length && !r.relativaLiberada) falta = "Marque \"Avaliado e liberado pela profissional\".";
  const texto =
    situacao === "absoluta"
      ? r.absolutaConfirmada
        ? "Contraindicação absoluta declarada; a profissional confirmou e decidiu prosseguir"
        : "Contraindicação absoluta: o procedimento não deve ser feito"
      : situacao === "relativa"
        ? r.relativaLiberada
          ? "Contraindicação relativa avaliada e liberada pela profissional"
          : "Contraindicação relativa: falta a avaliação da profissional"
        : "Sem contraindicações declaradas";
  return { situacao, absolutas, relativas, podeSeguir: falta === null, falta, texto };
}

/** O que fica guardado junto da assinatura do paciente (assinaturas_sessao.triagem). */
export interface TriagemRegistro {
  v: 1;
  situacao: SituacaoTriagem;
  texto: string;
  /** ids das condições marcadas. */
  marcadas: string[];
  absolutas: string[];
  relativas: string[];
  /** Nomes das condições marcadas, como estavam na tela. */
  nomes: string[];
  disparoTeste: boolean;
  relativaLiberada: boolean;
  absolutaConfirmada: boolean;
  termo: { versao: string; aceito: boolean; texto: string; resumo: string };
  em: string;
}

export function registroDaTriagem(r: RespostasTriagem, termoAceito: boolean, agora: Date = new Date()): TriagemRegistro {
  const c = classificarTriagem(r);
  const marcadas = [...c.absolutas, ...c.relativas];
  return {
    v: 1,
    situacao: c.situacao,
    texto: c.texto,
    marcadas: marcadas.map((x) => x.id),
    absolutas: c.absolutas.map((x) => x.id),
    relativas: c.relativas.map((x) => x.id),
    nomes: marcadas.map((x) => x.texto),
    disparoTeste: !!r.disparoTeste,
    relativaLiberada: c.relativas.length > 0 && !!r.relativaLiberada,
    absolutaConfirmada: c.absolutas.length > 0 && !!r.absolutaConfirmada,
    termo: { versao: TERMO_VERSAO, aceito: !!termoAceito, texto: TERMO_TEXTO, resumo: TERMO_RESUMO },
    em: agora.toISOString(),
  };
}

/** Lê a triagem guardada (coluna triagem; antes do SQL dela, dentro de resumo.triagem). Nulo se não houver. */
export function lerTriagem(linha: { triagem?: unknown; resumo?: unknown } | null | undefined): TriagemRegistro | null {
  const bruto = (linha?.triagem ?? (linha?.resumo as { triagem?: unknown } | null | undefined)?.triagem) as Partial<TriagemRegistro> | null | undefined;
  if (!bruto || typeof bruto !== "object" || !bruto.situacao) return null;
  const sit: SituacaoTriagem = bruto.situacao === "absoluta" || bruto.situacao === "relativa" ? bruto.situacao : "sem";
  return {
    v: 1,
    situacao: sit,
    texto: String(bruto.texto ?? ""),
    marcadas: Array.isArray(bruto.marcadas) ? bruto.marcadas.map(String) : [],
    absolutas: Array.isArray(bruto.absolutas) ? bruto.absolutas.map(String) : [],
    relativas: Array.isArray(bruto.relativas) ? bruto.relativas.map(String) : [],
    nomes: Array.isArray(bruto.nomes) ? bruto.nomes.map(String) : [],
    disparoTeste: !!bruto.disparoTeste,
    relativaLiberada: !!bruto.relativaLiberada,
    absolutaConfirmada: !!bruto.absolutaConfirmada,
    termo: {
      versao: String(bruto.termo?.versao ?? ""),
      aceito: !!bruto.termo?.aceito,
      texto: String(bruto.termo?.texto ?? ""),
      resumo: String(bruto.termo?.resumo ?? ""),
    },
    em: String(bruto.em ?? ""),
  };
}

/** Linha curta da ficha impressa e do prontuário. */
export function textoTriagemImpressao(t: TriagemRegistro): string {
  const base =
    t.situacao === "absoluta"
      ? "Contraindicação absoluta confirmada pela profissional"
      : t.situacao === "relativa"
        ? "Contraindicações relativas avaliadas pela profissional"
        : "Sem contraindicações declaradas";
  const quais = t.nomes.length ? `: ${t.nomes.join("; ")}` : "";
  return `${base}${quais}. Disparo teste ${t.disparoTeste ? "realizado" : "não registrado"}.`;
}
