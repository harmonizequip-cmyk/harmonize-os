// Manutenção do HIPRO (e-book do HIPRO, capítulo 26 "Manutenção e cuidados
// operacionais"). Regras puras: situação da troca de água de cada HIPRO e o
// guia resumido de cuidados mostrado em Equipamentos e na Agenda.

import { duracaoEmDias, somarDias } from "./period";

/** A água do circuito é trocada a cada 15 dias (e-book do HIPRO). */
export const INTERVALO_TROCA_AGUA_DIAS = 15;

/** Tipos aceitos em manutencoes_equipamento.tipo (o check do banco tem a mesma lista). */
export const TIPOS_MANUTENCAO = ["troca_agua"] as const;
export type TipoManutencao = (typeof TIPOS_MANUTENCAO)[number];

export const MSG_FALTA_SQL_MANUTENCAO = "Falta rodar o SQL da manutenção.";

/** Erro de tabela ou função que ainda não existe no banco (SQL não rodado). */
export function faltaSqlManutencao(erro: { code?: string; message?: string } | null | undefined): boolean {
  if (!erro) return false;
  return (
    erro.code === "42P01" ||
    erro.code === "42883" ||
    erro.code === "PGRST202" ||
    erro.code === "PGRST205" ||
    (/manutencoes_equipamento|registrar_manutencao_equipamento|excluir_manutencao_equipamento/i.test(erro.message ?? "") &&
      /does not exist|could not find|schema cache/i.test(erro.message ?? ""))
  );
}

export type SituacaoAgua = "nunca" | "em_dia" | "vence_logo" | "vence_hoje" | "atrasada";

export interface EstadoAgua {
  situacao: SituacaoAgua;
  /** Dia da última troca registrada. */
  ultima: string | null;
  /** Dia em que vence a próxima troca (última + 15). */
  proxima: string | null;
  /** Dias até vencer (0 = hoje; negativo = atrasada há tantos dias). */
  dias: number | null;
}

/** Vence em até 3 dias: já vale lembrar ao sair para a próxima locação. */
export const AVISO_AGUA_DIAS = 3;

function diasEntre(de: string, ate: string): number {
  return ate >= de ? duracaoEmDias(de, ate) - 1 : -(duracaoEmDias(ate, de) - 1);
}

/** Situação da troca de água a partir da última troca e de hoje (hojeLocal). */
export function situacaoAgua(ultima: string | null | undefined, hoje: string, intervalo = INTERVALO_TROCA_AGUA_DIAS): EstadoAgua {
  if (!ultima) return { situacao: "nunca", ultima: null, proxima: null, dias: null };
  const proxima = somarDias(ultima, intervalo);
  const dias = diasEntre(hoje, proxima);
  const situacao: SituacaoAgua =
    dias < 0 ? "atrasada" : dias === 0 ? "vence_hoje" : dias <= AVISO_AGUA_DIAS ? "vence_logo" : "em_dia";
  return { situacao, ultima, proxima, dias };
}

/** Última troca de cada equipamento, a partir das linhas de manutencoes_equipamento. */
export function ultimaTrocaPorEquipamento(
  linhas: { equipment_id: string; tipo: string; feita_em: string }[]
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const l of linhas) {
    if (l.tipo !== "troca_agua") continue;
    const atual = mapa.get(l.equipment_id);
    if (!atual || l.feita_em > atual) mapa.set(l.equipment_id, l.feita_em);
  }
  return mapa;
}

/** Precisa de atenção (aviso do Dashboard e alerta na Agenda): vence hoje ou atrasada. */
export function aguaPrecisaTrocar(e: EstadoAgua): boolean {
  return e.situacao === "vence_hoje" || e.situacao === "atrasada";
}

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** Frase curta da situação, para a faixa da tela e os avisos. */
export function textoAgua(e: EstadoAgua): string {
  switch (e.situacao) {
    case "nunca":
      return "Nenhuma troca registrada. Registre a última.";
    case "atrasada":
      return `Atrasada há ${plural(-(e.dias ?? 0), "dia", "dias")}`;
    case "vence_hoje":
      return "Vence hoje";
    default:
      return `Vence em ${plural(e.dias ?? 0, "dia", "dias")}`;
  }
}

/** Texto do aviso do Dashboard para um HIPRO (nome + situação). */
export function textoAvisoAgua(nome: string, e: EstadoAgua): string {
  if (e.situacao === "atrasada") return `${nome} atrasada há ${plural(-(e.dias ?? 0), "dia", "dias")}`;
  if (e.situacao === "vence_hoje") return `${nome} vence hoje`;
  if (e.situacao === "nunca") return `${nome} sem registro`;
  return `${nome} em ${plural(e.dias ?? 0, "dia", "dias")}`;
}

// ---------------------------------------------------------------------------
// Guia resumido (e-book do HIPRO, capítulo 26)

export interface SecaoCuidados {
  id: "agua" | "bolhas" | "limpeza" | "mangueira" | "transporte" | "energia";
  titulo: string;
  itens: string[];
  /** O que nunca fazer (aparece em destaque). */
  nunca?: string;
}

export const GUIA_CUIDADOS: SecaoCuidados[] = [
  {
    id: "agua",
    titulo: "Água do circuito",
    itens: [
      `Trocar a água a cada ${INTERVALO_TROCA_AGUA_DIAS} dias.`,
      "Usar só água destilada, deionizada, desmineralizada ou para autoclave.",
      "Cerca de 1,5 litro para purgar e encher todo o circuito.",
      "Depois de encher, deixar circular para tirar o ar (sangria).",
    ],
    nunca: "Água mineral ou de torneira: minerais e cloro corroem o transdutor.",
  },
  {
    id: "bolhas",
    titulo: "Bolhas na membrana",
    itens: [
      "Antes de cada aplicação, olhar a ponta do aplicador contra a luz.",
      "Com bolha: manopla virada para baixo e movimentos circulares suaves até ela sair.",
    ],
    nunca: "Disparar com bolha: queima a membrana e destrói o cristal.",
  },
  {
    id: "limpeza",
    titulo: "Limpeza do aplicador",
    itens: [
      "Clorexidina degermante diluída ou aquosa 0,2% com gaze.",
      "Tirar o resíduo com lenço umedecido em água destilada.",
    ],
    nunca: "Álcool (etílico ou isopropílico) ou solvente no aplicador e na membrana.",
  },
  {
    id: "mangueira",
    titulo: "Mangueira e manopla",
    itens: ["Manusear a mangueira sem puxar, torcer ou dar solavancos."],
    nunca: "Puxar o equipamento pela manopla.",
  },
  {
    id: "transporte",
    titulo: "Antes de transportar",
    itens: [
      "Esgotar toda a água da bomba pela mangueira de dreno.",
      "Não apoiar o peso da máquina sobre o cabeçote ou as mangueiras.",
    ],
  },
  {
    id: "energia",
    titulo: "Energia",
    itens: ["Tomada 220 V / 60 Hz.", "Recomendado estabilizador ou nobreak senoidal de 300 VA."],
  },
];

/** Checklist do dia da locação, em três momentos. */
export const CHECKLIST_DIA: { id: "antes" | "chegada" | "fim"; titulo: string; itens: { id: string; texto: string }[] }[] = [
  {
    id: "antes",
    titulo: "Antes de sair",
    itens: [
      { id: "drenar", texto: "Drenar toda a água da bomba pela mangueira de dreno" },
      { id: "peso", texto: "Não apoiar peso no cabeçote nem nas mangueiras" },
    ],
  },
  {
    id: "chegada",
    titulo: "Ao chegar",
    itens: [
      { id: "encher", texto: "Completar com água destilada e deixar circular para tirar o ar" },
      { id: "bolhas", texto: "Conferir bolhas na membrana contra a luz" },
      { id: "tomada", texto: "Tomada 220 V, de preferência com nobreak" },
    ],
  },
  {
    id: "fim",
    titulo: "Ao terminar",
    itens: [
      { id: "limpar", texto: "Limpar com clorexidina, nunca álcool" },
      { id: "manopla", texto: "Não puxar pela manopla nem tracionar a mangueira" },
    ],
  },
];
