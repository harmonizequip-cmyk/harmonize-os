// Histórico de notificações e contagem do sino (05/11/2026). Regras puras,
// testadas em notificacoes.test.ts.

export interface Notificacao {
  id: string;
  tipo: string;
  titulo: string;
  texto: string | null;
  url: string | null;
  criada_em: string;
  lida_em: string | null;
}

export interface ResumoPendencias {
  /** Quantos avisos do "Precisa de você" estão abertos (mesma conta do Dashboard). */
  total: number;
  urgentes: number;
  /** Notificações do celular ainda não lidas. */
  naoLidas: number;
}

/** Dia de Brasília (AAAA-MM-DD) de um instante. */
export function diaDeBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** Hora de Brasília (HH:MM) de um instante. */
export function horaDeBrasilia(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "Hoje", "Ontem" ou "dd/mm" para o cabeçalho de cada dia. */
export function rotuloDia(dia: string, hoje: string, ontem: string): string {
  if (dia === hoje) return "Hoje";
  if (dia === ontem) return "Ontem";
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Agrupa por dia de Brasília, do mais recente para o mais antigo. */
export function agruparPorDia<T extends Pick<Notificacao, "criada_em">>(lista: T[]): { dia: string; itens: T[] }[] {
  const ordenada = [...lista].sort((a, b) => b.criada_em.localeCompare(a.criada_em));
  const grupos: { dia: string; itens: T[] }[] = [];
  for (const n of ordenada) {
    const dia = diaDeBrasilia(n.criada_em);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(n);
    else grupos.push({ dia, itens: [n] });
  }
  return grupos;
}

/** Número do selo do sino: pendências; acima de 99 vira "99+". Zero = sem selo. */
export function textoSelo(total: number): string | null {
  if (!total || total < 0) return null;
  return total > 99 ? "99+" : String(total);
}

/** Endereço interno seguro para abrir a notificação (só caminhos do próprio app). */
export function enderecoInterno(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  return null;
}
