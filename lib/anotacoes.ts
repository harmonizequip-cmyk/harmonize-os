// Origem de cada anotação da cliente (tabela cliente_anotacoes).
// 'campanha' nasce só das funções do banco registrar_envio_campanha e
// desfazer_envio_campanha (migration 2026-10-26-campanha-registra-anotacao.sql).

export type OrigemAnotacao = "digitada" | "voz" | "assistente" | "campanha";

export const ROTULO_ORIGEM_ANOTACAO: Record<OrigemAnotacao, string> = {
  digitada: "digitada",
  voz: "por voz",
  assistente: "pelo assistente",
  campanha: "Campanha",
};

/** Origem conhecida; qualquer valor estranho ou vazio conta como digitada. */
export function origemDaAnotacao(origem: string | null | undefined): OrigemAnotacao {
  return origem && Object.prototype.hasOwnProperty.call(ROTULO_ORIGEM_ANOTACAO, origem)
    ? (origem as OrigemAnotacao)
    : "digitada";
}
