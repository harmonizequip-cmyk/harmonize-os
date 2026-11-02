// Origem de cada anotação da cliente (tabela cliente_anotacoes).
// 'campanha' nasce só das funções do banco registrar_envio_campanha e
// desfazer_envio_campanha (migration 2026-10-26-campanha-registra-anotacao.sql);
// 'formulario' nasce de convite_cadastro_receber (como conheceu a Harmonize);
// 'indicacao' nasce dos gatilhos do programa de indicação (desconto ganho).

export type OrigemAnotacao = "digitada" | "voz" | "assistente" | "campanha" | "formulario" | "indicacao";

export const ROTULO_ORIGEM_ANOTACAO: Record<OrigemAnotacao, string> = {
  digitada: "digitada",
  voz: "por voz",
  assistente: "pelo assistente",
  campanha: "Campanha",
  formulario: "Formulário",
  indicacao: "Indicação",
};

/** Origem conhecida; qualquer valor estranho ou vazio conta como digitada. */
export function origemDaAnotacao(origem: string | null | undefined): OrigemAnotacao {
  return origem && Object.prototype.hasOwnProperty.call(ROTULO_ORIGEM_ANOTACAO, origem)
    ? (origem as OrigemAnotacao)
    : "digitada";
}
