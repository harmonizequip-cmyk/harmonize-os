import { buildCobrancaTaxaMessage } from "./cobranca";
import { buildPedidoConfirmacaoMessage } from "./confirmacao";
import { variaveisDaPessoa } from "./saudacao";
import { renderizarModelo, type ModelosMensagem } from "./mensagens-modelos";

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
 * para cobrança de taxa e confirmação). Pós-locação, contato e confirmação
 * usam o texto de Configurações > Mensagens (`modelos`); a cobrança de taxa
 * continua fixa (é a mesma da função alertas).
 */
export function mensagemDaTarefa(params: {
  tipo: TipoTarefa;
  name?: string | null;
  treatment?: string | null;
  displayName?: string | null;
  dataEvento?: string | null;
  valorTaxa?: number;
  modelos?: Partial<ModelosMensagem> | null;
}): string | null {
  const nome = { name: params.name, treatment: params.treatment, displayName: params.displayName };
  const pessoa = variaveisDaPessoa(nome);

  switch (params.tipo) {
    case "cobranca_taxa":
      if (!params.dataEvento) return null;
      return buildCobrancaTaxaMessage({ ...nome, dataEvento: params.dataEvento, valor: params.valorTaxa ?? 0 });
    case "confirmacao":
      if (!params.dataEvento) return null;
      return buildPedidoConfirmacaoMessage({ ...nome, dateStart: params.dataEvento, modelos: params.modelos }).message;
    case "pos_locacao":
      return renderizarModelo("posLocacao", pessoa, params.modelos);
    case "contato_inicial":
    case "recontato":
    case "followup":
      // Mesmo modelo do Relacionamento para leads mornos e frios.
      return renderizarModelo("interesse", pessoa, params.modelos);
    default:
      return null;
  }
}
