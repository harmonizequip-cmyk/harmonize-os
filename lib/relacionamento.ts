// ============================================================
// RELACIONAMENTO: classificar clientes e leads e decidir quem chamar hoje
// (pedido do dono, 17/10/2026: "não esquecer de conversar com clientes e
// leads, e uma forma de classificá-los").
//
// A classificação é automática, a partir do que já existe no banco
// (locações, reservas, etapa do funil e o último contato). Nada para marcar à
// mão: as tags manuais nunca foram usadas, então a regra é o sistema
// classificar sozinho.
//
// Último contato = o mais recente entre: tarefa concluída da pessoa, agenda
// enviada (agenda_envios), pedido de confirmação enviado e "Já falei" na tela
// Relacionamento (que grava uma tarefa concluída).
// ============================================================

import { DEFAULT_PREFERENCIAS, type Preferencias } from "./preferencias";

export type ClasseCliente = "agendada" | "nova" | "ativa" | "em_risco" | "sumida";
export type ClasseLead = "quente" | "morna" | "fria";
export type Classe = ClasseCliente | ClasseLead;
export type Valor = "vip" | "boa" | "comum";

export const ROTULO_CLASSE: Record<Classe, { rotulo: string; emoji: string; cor: string; dica: string }> = {
  agendada: { rotulo: "Agendada", emoji: "📅", cor: "bg-brand-pink/10 text-brand-pink-dark", dica: "Tem atendimento marcado" },
  nova: { rotulo: "Nova", emoji: "🌱", cor: "bg-emerald-50 text-emerald-700", dica: "Fez a primeira locação há pouco" },
  ativa: { rotulo: "Ativa", emoji: "✅", cor: "bg-brand-teal/10 text-brand-teal-dark", dica: "Locando no ritmo dela" },
  em_risco: { rotulo: "Em risco", emoji: "⚠️", cor: "bg-amber-50 text-amber-700", dica: "Passou do tempo em que costuma voltar" },
  sumida: { rotulo: "Sumida", emoji: "💤", cor: "bg-neutral-100 text-neutral-600", dica: "Mais de 4 meses sem locar" },
  quente: { rotulo: "Quente", emoji: "🔥", cor: "bg-rose-50 text-rose-600", dica: "Lead com interesse ou data em vista" },
  morna: { rotulo: "Morna", emoji: "🌤️", cor: "bg-amber-50 text-amber-700", dica: "Lead em conversa" },
  fria: { rotulo: "Fria", emoji: "❄️", cor: "bg-sky-50 text-sky-700", dica: "Lead parado há mais de 2 semanas" },
};

export const ROTULO_VALOR: Record<Valor, { rotulo: string; emoji: string; cor: string } | null> = {
  vip: { rotulo: "VIP", emoji: "💎", cor: "bg-violet-50 text-violet-700" },
  boa: { rotulo: "Frequente", emoji: "⭐", cor: "bg-amber-50 text-amber-700" },
  comum: null,
};

export interface PessoaBase {
  id: string;
  nome: string;
  treatment: string | null;
  displayName: string | null;
  whatsapp: string | null;
  cidade: string | null;
  stage: string;
  ehCliente: boolean;
  parceiro: boolean;
  criadoEm: string; // AAAA-MM-DD
  /** Datas das locações que contam (sem cancelada/teste), AAAA-MM-DD. */
  locacoes: { data: string; valor: number }[];
  /** Próximo atendimento marcado (hoje ou depois), AAAA-MM-DD. */
  proximaReserva: string | null;
  /** Último contato registrado, AAAA-MM-DD. */
  ultimoContato: string | null;
  /** Quanto deve de locações vencidas. */
  deve: number;
  tarefasPendentes: number;
}

export interface PessoaClassificada extends PessoaBase {
  classe: Classe;
  valor: Valor;
  totalFaturado: number;
  ultimaLocacao: string | null;
  /** Média de dias entre locações (precisa de 2 ou mais). */
  ritmo: number | null;
  diasSemLocar: number | null;
  diasSemContato: number;
  /** Chamar a cada quantos dias, conforme a classe. */
  cadencia: number | null;
  /** Já passou da cadência: entra em "chamar hoje". */
  devida: boolean;
  motivo: string | null;
  prioridade: number;
}

export function diasEntre(inicio: string, fim: string): number {
  const a = Date.UTC(+inicio.slice(0, 4), +inicio.slice(5, 7) - 1, +inicio.slice(8, 10));
  const b = Date.UTC(+fim.slice(0, 4), +fim.slice(5, 7) - 1, +fim.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

const ETAPAS_QUENTES = new Set(["qualificado", "agendado"]);

/** Cadência (dias entre conversas) por classe. Agendada não entra: a confirmação já cuida. */
export const CADENCIA: Record<Classe, number | null> = {
  agendada: null,
  ...DEFAULT_PREFERENCIAS.relacionamento.cadencia,
};

type ConfigRelacionamento = Preferencias["relacionamento"];

function cadenciaDaClasse(classe: Classe, cfg: ConfigRelacionamento): number | null {
  return classe === "agendada" ? null : cfg.cadencia[classe];
}

/**
 * Curva ABC do faturamento: VIP são as clientes que, somadas, fazem a
 * primeira metade do faturamento; Frequente, as que fazem os 30% seguintes.
 */
export function valorPorFaturamento(
  totais: Map<string, number>,
  cfg: ConfigRelacionamento = DEFAULT_PREFERENCIAS.relacionamento
): Map<string, Valor> {
  const lista = Array.from(totais.entries()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const soma = lista.reduce((s, [, v]) => s + v, 0);
  const resultado = new Map<string, Valor>();
  let acumulado = 0;
  for (const [id, v] of lista) {
    const antes = acumulado / (soma || 1);
    resultado.set(id, antes < cfg.vipFatia ? "vip" : antes < cfg.frequenteFatia ? "boa" : "comum");
    acumulado += v;
  }
  return resultado;
}

export function classificar(
  p: PessoaBase,
  hoje: string,
  valor: Valor,
  cfg: ConfigRelacionamento = DEFAULT_PREFERENCIAS.relacionamento
): PessoaClassificada {
  const locs = [...p.locacoes].filter((l) => l.data <= hoje).sort((a, b) => a.data.localeCompare(b.data));
  const totalFaturado = p.locacoes.reduce((s, l) => s + l.valor, 0);
  const ultimaLocacao = locs.length ? locs[locs.length - 1].data : null;
  const diasSemLocar = ultimaLocacao ? diasEntre(ultimaLocacao, hoje) : null;
  let ritmo: number | null = null;
  if (locs.length >= 2) {
    ritmo = Math.round(diasEntre(locs[0].data, locs[locs.length - 1].data) / (locs.length - 1));
  }
  const referenciaContato = [p.ultimoContato, ultimaLocacao, p.criadoEm].filter(Boolean).sort().pop() as string;
  const diasSemContato = Math.max(0, diasEntre(referenciaContato, hoje));

  let classe: Classe;
  let motivo: string | null = null;
  const cliente = p.ehCliente || locs.length > 0;

  if (cliente) {
    const limiteRisco = ritmo ? Math.max(cfg.riscoMinimoDias, Math.round(ritmo * cfg.riscoMultiplicador)) : cfg.riscoSemRitmoDias;
    if (p.proximaReserva) classe = "agendada";
    else if (diasSemLocar === null) classe = "sumida";
    else if (diasSemLocar > cfg.sumidaDias) classe = "sumida";
    else if (locs.length === 1 && diasSemLocar <= cfg.novaAteDias) classe = "nova";
    else if (diasSemLocar > limiteRisco) classe = "em_risco";
    else classe = "ativa";

    if (classe === "nova") motivo = `Primeira locação há ${diasSemLocar} dias: pergunte como foi e ofereça a próxima data`;
    else if (classe === "em_risco")
      motivo =
        ritmo
            ? `Costuma voltar a cada ${ritmo} dias e já são ${diasSemLocar}`
            : `${diasSemLocar} dias sem locar e sem nada marcado`;
    else if (classe === "sumida")
      motivo = diasSemLocar === null ? "Cliente sem locação registrada no sistema: vale reativar" : `Sem locar há ${diasSemLocar} dias: vale reativar`;
    else if (classe === "ativa") motivo = "Sem data marcada: ofereça as próximas datas";
  } else {
    if (ETAPAS_QUENTES.has(p.stage) || (p.proximaReserva && !cliente)) classe = "quente";
    else if (p.stage === "em_contato" || diasSemContato <= cfg.mornaDias) classe = "morna";
    else classe = "fria";
    motivo =
      classe === "quente"
        ? "Mostrou interesse: puxe para marcar a data"
        : classe === "morna"
          ? "Conversa em andamento: não deixe esfriar"
          : `Lead parado há ${diasSemContato} dias`;
  }

  const cadencia = cadenciaDaClasse(classe, cfg);
  const devida = cadencia !== null && diasSemContato >= cadencia;

  // Prioridade (maior primeiro): valor da cliente, risco de perder e atraso
  // em relação à cadência.
  const pesoClasse: Record<Classe, number> = { quente: 60, em_risco: 55, nova: 45, ativa: 35, morna: 30, sumida: 20, fria: 10, agendada: 0 };
  const pesoValor: Record<Valor, number> = { vip: 30, boa: 15, comum: 0 };
  const atraso = cadencia ? Math.min(30, diasSemContato - cadencia) : 0;
  const prioridade = devida ? pesoClasse[classe] + pesoValor[valor] + atraso : 0;

  return {
    ...p,
    classe,
    valor,
    totalFaturado,
    ultimaLocacao,
    ritmo,
    diasSemLocar,
    diasSemContato,
    cadencia,
    devida,
    motivo: devida ? motivo : null,
    prioridade,
  };
}

/** Classifica todas e devolve em ordem de prioridade. */
export function classificarTodas(
  pessoas: PessoaBase[],
  hoje: string,
  cfg: ConfigRelacionamento = DEFAULT_PREFERENCIAS.relacionamento
): PessoaClassificada[] {
  const totais = new Map<string, number>();
  for (const p of pessoas) totais.set(p.id, p.locacoes.reduce((s, l) => s + l.valor, 0));
  const valores = valorPorFaturamento(totais, cfg);
  return pessoas
    .map((p) => classificar(p, hoje, valores.get(p.id) ?? "comum", cfg))
    .sort((a, b) => b.prioridade - a.prioridade || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Quantas pessoas aparecem por dia em "chamar hoje" (o resto espera, sem virar pilha). */
export const LIMITE_DIARIO = DEFAULT_PREFERENCIAS.relacionamento.limiteDiario;

export function mensagemRelacionamento(p: Pick<PessoaClassificada, "classe" | "nome" | "treatment" | "displayName">, saudacao: string): string {
  const s = `${saudacao} 😊`;
  switch (p.classe) {
    case "nova":
      return `${s}\n\nComo foram os resultados das suas pacientes com o HIPRO? Fiquei feliz em te atender! Se quiser, já te passo as próximas datas disponíveis.`;
    case "ativa":
      return `${s}\n\nEstou organizando a agenda dos próximos dias. Quer garantir a sua data do HIPRO? Te mando as disponíveis para a sua região.`;
    case "em_risco":
    case "sumida":
      return `${s}\n\nFaz um tempinho que não fazemos um atendimento com o HIPRO! Tenho datas abertas para a sua região. Quer que eu te mande?`;
    case "quente":
      return `${s}\n\nConseguiu ver as informações do HIPRO? Posso reservar uma data para você? As datas desta quinzena estão saindo rápido.`;
    case "morna":
    case "fria":
    default:
      return `${s}\n\nPassando para saber se você ainda tem interesse em conhecer o HIPRO. Posso te passar as datas disponíveis para a sua região?`;
  }
}
