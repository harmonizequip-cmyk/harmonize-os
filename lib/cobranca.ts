import { formatCurrency, formatDate } from "./format";

/**
 * Mensagem de cobrança por WhatsApp de um cliente com saldo em aberto.
 * Segue a regra de saudação das outras mensagens (tratamento + nome de
 * exibição); sem os dois, a saudação vira só "Olá! 😊", mas a cobrança em
 * si vai inteira, porque aqui o assunto é o valor e não pode se perder.
 */
export function buildCobrancaMessage(params: {
  treatment: string | null | undefined;
  displayName: string | null | undefined;
  locacoes: { eventDate: string; saldo: number }[];
}): string {
  const treatment = params.treatment?.trim();
  const displayName = params.displayName?.trim();
  const saudacao = treatment && displayName ? `Olá, ${treatment} ${displayName}! 😊` : "Olá! 😊";
  const total = params.locacoes.reduce((s, l) => s + l.saldo, 0);

  const corpo =
    params.locacoes.length === 1
      ? `Passando para lembrar do pagamento em aberto da locação de ${formatDate(params.locacoes[0].eventDate)}, no valor de ${formatCurrency(total)}.`
      : `Passando para lembrar dos pagamentos em aberto das locações de ${params.locacoes
          .map((l) => formatDate(l.eventDate))
          .join(", ")}, somando ${formatCurrency(total)}.`;

  return `${saudacao}\n\n${corpo}\n\nSe já realizou o pagamento, me envie o comprovante, por favor. Obrigada! 🙏`;
}
