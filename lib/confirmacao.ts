import { formatDate } from "./format";
import { tratamentoEPrimeiroNome, variaveisDaPessoa } from "./saudacao";
import { renderizarModelo, type ModelosMensagem } from "./mensagens-modelos";

/**
 * Monta a mensagem do botão "Pedir confirmação no WhatsApp".
 *
 * A mensagem depende só do nome do cliente e da data: nunca do
 * equipamento (HIPRO 1/HIPRO 2) nem de qualquer outro dado interno.
 *
 * Saudação: tratamento e primeiro nome, na mesma regra das outras
 * mensagens (lib/saudacao.ts). Vem do cadastro (Tratamento e Nome de
 * exibição) e, na falta deles, do campo "Nome" ("DRA. SIMONE KARLA -
 * BOM JARDIM" vira "Dra. Simone").
 *
 * A mensagem vai sempre inteira. Antes, cadastro sem Tratamento ou Nome de
 * exibição reduzia tudo a "Olá! 😊" para forçar o preenchimento; com
 * quase todos os cadastros nessa situação, a regra só impedia o envio.
 * cadastroIncompleto agora só é verdadeiro quando não dá para tirar nome
 * nenhum, e nesse caso a saudação fica genérica.
 */
export function buildPedidoConfirmacaoMessage(params: {
  name?: string | null;
  treatment: string | null | undefined;
  displayName: string | null | undefined;
  dateStart: string;
  modelos?: Partial<ModelosMensagem> | null;
}): { message: string; cadastroIncompleto: boolean } {
  const { primeiroNome } = tratamentoEPrimeiroNome({
    name: params.name,
    treatment: params.treatment,
    displayName: params.displayName,
  });

  // Texto editável em Configurações > Mensagens; sem modelo salvo, o de sempre
  // ("Olá! 😊" quando não há nome).
  const message = renderizarModelo(
    "confirmacao",
    { ...variaveisDaPessoa(params), data: formatDate(params.dateStart) },
    params.modelos
  );
  return { message, cadastroIncompleto: !primeiroNome };
}
