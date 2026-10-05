import { buildCobrancaTaxaMessage } from "./cobranca";
import { buildPedidoConfirmacaoMessage } from "./confirmacao";
import { saudacaoCurta } from "./saudacao";

export type TipoTarefa =
  | "contato_inicial"
  | "followup"
  | "manual"
  | "recontato"
  | "confirmacao"
  | "pos_locacao"
  | "cobranca_taxa";

/**
 * Mensagem de WhatsApp pronta para cada tipo de tarefa automática. A pessoa
 * sempre vê o texto no WhatsApp antes de enviar. Devolve null quando a
 * tarefa não tem mensagem possível (manual, ou faltou a data da reserva
 * para cobrança de taxa e confirmação).
 */
export function mensagemDaTarefa(params: {
  tipo: TipoTarefa;
  name?: string | null;
  treatment?: string | null;
  displayName?: string | null;
  dataEvento?: string | null;
  valorTaxa?: number;
}): string | null {
  const nome = { name: params.name, treatment: params.treatment, displayName: params.displayName };
  const saudacao = `${saudacaoCurta(nome)} 😊`;

  switch (params.tipo) {
    case "cobranca_taxa":
      if (!params.dataEvento) return null;
      return buildCobrancaTaxaMessage({ ...nome, dataEvento: params.dataEvento, valor: params.valorTaxa ?? 0 });
    case "confirmacao":
      if (!params.dataEvento) return null;
      return buildPedidoConfirmacaoMessage({ ...nome, dateStart: params.dataEvento }).message;
    case "pos_locacao":
      return (
        `${saudacao}\n\n` +
        `Passando para saber como foi a sua experiência com o HIPRO e se ficou alguma dúvida. ` +
        `Foi um prazer atender você! Qualquer coisa, é só me chamar. 🙏`
      );
    case "contato_inicial":
    case "recontato":
    case "followup":
      return (
        `${saudacao}\n\n` +
        `Passando para saber se você ainda tem interesse em conhecer o HIPRO. ` +
        `Posso te passar as datas disponíveis para a sua região?`
      );
    default:
      return null;
  }
}
