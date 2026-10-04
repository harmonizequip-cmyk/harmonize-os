import { formatCurrency, formatDate } from "./format";
import { saudacaoCurta } from "./saudacao";

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

/** Cobrança da taxa de reserva ainda não paga. Saudação com primeiro nome. */
export function buildCobrancaTaxaMessage(params: {
  name?: string | null;
  treatment: string | null | undefined;
  displayName: string | null | undefined;
  dataEvento: string;
  valor: number;
}): string {
  const saudacao = saudacaoCurta({ name: params.name, treatment: params.treatment, displayName: params.displayName });
  const valor = params.valor > 0 ? ` de ${formatCurrency(params.valor)}` : "";
  return (
    `${saudacao} 😊\n\n` +
    `Passando para lembrar da taxa de reserva${valor} para garantir a sua data de ${formatDate(params.dataEvento)}. ` +
    `Assim que o pagamento for confirmado, a data fica reservada para você.\n\n` +
    `Se já realizou o pagamento, me envie o comprovante, por favor. Obrigada! 🙏`
  );
}
