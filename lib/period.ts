// ============================================================
// PERÍODO: fonte única de "que intervalo de datas a tela está mostrando"
//
// POR QUE ESTE ARQUIVO CALCULA NO FUSO DE BRASÍLIA
//
// A versão anterior usava o relógio do servidor. Na Vercel o servidor
// roda em UTC, e você trabalha em UTC-3. Às 21h do dia 24, em UTC já é
// dia 25: "Hoje" mostrava o dia seguinte e escondia o que tinha
// acontecido no dia. No dia 30 às 21h, "Este mês" pulava para o mês que
// vem, e o fechamento do mês aparecia zerado.
//
// Aqui a data de referência sai do Intl com timeZone America/Sao_Paulo,
// que é o calendário que você tem na parede. O Intl faz parte do Node,
// então isto não acrescenta dependência nenhuma ao projeto.
//
// POR QUE A CONTA É FEITA EM STRING, E NÃO EM Date
//
// Todas as colunas de data do banco são date, sem hora. Manter Date no
// meio do caminho é o que produz o erro de fuso: basta uma conversão
// para virar o dia. Aqui o intervalo é sempre "YYYY-MM-DD", o mesmo
// formato que o Postgres recebe, e a aritmética usa uma âncora ao
// meio-dia UTC, longe das bordas de dia em qualquer fuso.
// ============================================================

const FUSO = "America/Sao_Paulo";

// en-CA formata como YYYY-MM-DD, que já é o formato do Postgres. Montar
// a string na mão a partir das partes daria o mesmo, com mais chance de
// errar o zero à esquerda.
const FORMATADOR = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** A data de hoje no calendário de Brasília, como "YYYY-MM-DD". */
export function hojeLocal(agora: Date = new Date()): string {
  return FORMATADOR.format(agora);
}

// Âncora ao meio-dia UTC: somar ou subtrair dias nunca cai em cima de
// uma virada de dia, em fuso nenhum, com ou sem horário de verão.
function ancora(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

function paraIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function somarDias(iso: string, dias: number): string {
  const d = ancora(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return paraIso(d);
}

export function primeiroDiaDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

export function ultimoDiaDoMes(iso: string): string {
  const d = ancora(primeiroDiaDoMes(iso));
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return paraIso(d);
}

export function mesAnterior(iso: string): string {
  const d = ancora(primeiroDiaDoMes(iso));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return paraIso(d);
}

export interface Periodo {
  /** Primeiro dia do intervalo, "YYYY-MM-DD", pronto para o .gte(). */
  inicio: string;
  /** Último dia do intervalo, inclusive, pronto para o .lte(). */
  fim: string;
  /** A chave que está na URL, para a barra de filtros marcar o botão. */
  chave: string;
  /** Como o período se chama na tela e no nome do arquivo exportado. */
  rotulo: string;
}

export const OPCOES_PERIODO = [
  { chave: "hoje", label: "Hoje" },
  { chave: "7dias", label: "7 dias" },
  { chave: "mes", label: "Este mês" },
  { chave: "mes_anterior", label: "Mês anterior" },
  { chave: "ano", label: "Este ano" },
  { chave: "personalizado", label: "Personalizado" },
] as const;

const NOMES_DOS_MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function rotuloDoMes(iso: string): string {
  const mes = Number(iso.slice(5, 7)) - 1;
  return `${NOMES_DOS_MESES[mes]} de ${iso.slice(0, 4)}`;
}

function paraBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Resolve o que está na URL num intervalo concreto de datas. É a única
 * função que decide o que "este mês" quer dizer: se cada tela decidisse
 * por conta própria, uma hora duas telas mostrariam totais diferentes
 * para o mesmo botão, que foi exatamente o problema que a Leva A
 * corrigiu nos valores.
 *
 * Período personalizado com as datas invertidas é endireitado em vez de
 * devolver intervalo vazio: quem digitou errado veria uma tela sem nada
 * e não saberia por quê.
 */
export function resolverPeriodo(
  chave: string | undefined,
  de?: string,
  ate?: string,
  agora: Date = new Date()
): Periodo {
  const hoje = hojeLocal(agora);

  switch (chave) {
    case "7dias": {
      const inicio = somarDias(hoje, -6);
      return {
        inicio,
        fim: hoje,
        chave: "7dias",
        rotulo: `${paraBr(inicio)} a ${paraBr(hoje)}`,
      };
    }

    case "mes":
      return {
        inicio: primeiroDiaDoMes(hoje),
        fim: ultimoDiaDoMes(hoje),
        chave: "mes",
        rotulo: rotuloDoMes(hoje),
      };

    case "mes_anterior": {
      const anterior = mesAnterior(hoje);
      return {
        inicio: primeiroDiaDoMes(anterior),
        fim: ultimoDiaDoMes(anterior),
        chave: "mes_anterior",
        rotulo: rotuloDoMes(anterior),
      };
    }

    case "ano": {
      const ano = hoje.slice(0, 4);
      return {
        inicio: `${ano}-01-01`,
        fim: `${ano}-12-31`,
        chave: "ano",
        rotulo: `ano de ${ano}`,
      };
    }

    case "personalizado": {
      // Sem data escolhida ainda, cai no mês corrente em vez de num
      // intervalo vazio, para a tela não abrir em branco.
      const a = de || primeiroDiaDoMes(hoje);
      const b = ate || hoje;
      const [inicio, fim] = a <= b ? [a, b] : [b, a];
      return {
        inicio,
        fim,
        chave: "personalizado",
        rotulo: `${paraBr(inicio)} a ${paraBr(fim)}`,
      };
    }

    case "hoje":
    default:
      return { inicio: hoje, fim: hoje, chave: "hoje", rotulo: paraBr(hoje) };
  }
}

/**
 * Forma antiga, mantida porque o Dashboard consome assim. Os Date que
 * saem daqui estão ancorados à meia-noite UTC do dia certo em Brasília,
 * então o `.toISOString().slice(0, 10)` que o Dashboard faz devolve
 * exatamente o mesmo que `resolverPeriodo` já entrega em string. Telas
 * novas devem usar resolverPeriodo e ficar longe de Date.
 */
export function resolvePeriod(period: string | undefined, from?: string, to?: string) {
  const p = resolverPeriodo(period, from, to);
  return {
    from: new Date(`${p.inicio}T00:00:00Z`),
    to: new Date(`${p.fim}T00:00:00Z`),
  };
}
