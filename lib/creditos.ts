// Créditos da cliente (tabela creditos_cliente, view creditos_saldo):
// disparos (abatem os disparos da próxima locação antes do cálculo) e R$
// (abatem como pagamento com forma permuta). Crédito de contagem só vale
// depois que a locação de origem estiver paga.

export interface SaldoCredito {
  client_id: string;
  disparos_disponiveis: number;
  disparos_aguardando: number;
  valor_disponivel: number;
}

export interface Contagem {
  inicial: number;
  final: number;
  /** A cliente paga hoje e os disparos desta contagem viram crédito. */
  gera_credito?: boolean;
}

export const ORIGEM_CREDITO: Record<string, string> = {
  contagem: "Troca de ponteira",
  permuta: "Permuta",
  manual: "Lançado à mão",
  uso: "Usado",
};

/** Disparos de uma contagem (a menor leitura é sempre a inicial). */
export function disparosDaContagem(c: Contagem): number {
  if (!c.inicial && c.inicial !== 0) return 0;
  if (!c.final && c.final !== 0) return 0;
  return Math.abs(Math.round(c.final) - Math.round(c.inicial));
}

/** Total de disparos das contagens e quanto vira crédito. */
export function somarContagens(contagens: Contagem[]): { total: number; credito: number } {
  let total = 0;
  let credito = 0;
  for (const c of contagens) {
    const d = disparosDaContagem(c);
    total += d;
    if (c.gera_credito) credito += d;
  }
  return { total, credito };
}

/** Quanto do crédito de disparos dá para usar nesta locação (nunca mais que os disparos feitos). */
export function creditoUsavel(disparos: number, disponivel: number): number {
  return Math.max(0, Math.min(Math.round(disparos), Math.round(disponivel)));
}

/** Disparos que vão para o cálculo do valor depois de usar o crédito. */
export function disparosCobrados(disparos: number, creditoUsado: number): number {
  return Math.max(0, Math.round(disparos) - Math.round(creditoUsado));
}

export function temCredito(s: Pick<SaldoCredito, "disparos_disponiveis" | "disparos_aguardando" | "valor_disponivel"> | null | undefined): boolean {
  return !!s && (s.disparos_disponiveis > 0 || s.disparos_aguardando > 0 || Number(s.valor_disponivel) > 0.009);
}

/** Texto curto do saldo: "3.500 disparos · R$ 100,00". */
export function resumoCredito(s: Pick<SaldoCredito, "disparos_disponiveis" | "disparos_aguardando" | "valor_disponivel">): string {
  const partes: string[] = [];
  if (s.disparos_disponiveis > 0) partes.push(`${s.disparos_disponiveis.toLocaleString("pt-BR")} disparos`);
  if (s.disparos_aguardando > 0) partes.push(`${s.disparos_aguardando.toLocaleString("pt-BR")} disparos aguardando pagamento`);
  if (Number(s.valor_disponivel) > 0.009)
    partes.push(Number(s.valor_disponivel).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  return partes.join(" · ");
}
