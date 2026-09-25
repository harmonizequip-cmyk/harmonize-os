import { formatDate } from "./format";

/**
 * Monta a mensagem do botão "Pedir confirmação no WhatsApp".
 *
 * Fica separada de AgendaClient.tsx (que só chama esta função) por dois
 * motivos: dá para testar sem montar um componente React, e deixa
 * explícito que a mensagem depende SÓ de treatment/displayName/dateStart
 * — nunca do campo de nome antigo do cliente, nunca do equipamento
 * (HIPRO 1/HIPRO 2) e nunca de qualquer outro dado interno.
 *
 * Regra do cadastro incompleto (seção 6 do pedido): se faltar
 * tratamento OU nome de exibição, a mensagem inteira vira "Olá! 😊" —
 * não é só a saudação que fica genérica, é a mensagem toda, de
 * propósito, para o cadastro incompleto ficar visivelmente errado até
 * ser corrigido, em vez de mandar metade de uma mensagem plausível.
 */
export function buildPedidoConfirmacaoMessage(params: {
  treatment: string | null | undefined;
  displayName: string | null | undefined;
  dateStart: string;
}): { message: string; cadastroIncompleto: boolean } {
  const treatment = params.treatment?.trim() || null;
  const displayName = params.displayName?.trim() || null;

  if (!treatment || !displayName) {
    return { message: "Olá! 😊", cadastroIncompleto: true };
  }

  const message =
    `Olá, ${treatment} ${displayName}! 😊\n\n` +
    `Passando para lembrar que seu HIPRO day está chegando: ${formatDate(params.dateStart)}.\n\n` +
    `Já estamos organizando tudo por aqui para mais um dia de sucesso. 🚀`;
  return { message, cadastroIncompleto: false };
}
