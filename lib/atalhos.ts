// Endereços dos atalhos entre telas: cada um abre direto o item, não a
// lista. Usados pelo componente components/Atalhos.tsx em todas as telas.

export const linkCliente = (clientId: string) => `/clientes/${clientId}`;

/** Abre a locação dentro da ficha da cliente (EditarLocacaoModal). */
export const linkLocacao = (clientId: string, rentalId: string) => `/clientes/${clientId}?locacao=${rentalId}`;

/** Abre o atendimento na Agenda, já no dia dele. */
export const linkEvento = (eventId: string) => `/agenda?evento=${eventId}`;

/** Só o dia na Agenda (quando não há o id do atendimento). */
export const linkDiaAgenda = (data: string) => `/agenda?date=${data.slice(0, 10)}`;

/** Abre a edição do lançamento no Financeiro. */
export const linkLancamento = (transactionId: string) => `/financeiro?lancamento=${transactionId}`;

/** Lançamentos da cliente no Financeiro (o ano todo). */
export const linkLancamentosCliente = (clientId: string) => `/financeiro?cliente=${clientId}&period=ano`;

/** Locações da cliente (o ano todo). */
export const linkLocacoesCliente = (clientId: string) => `/locacoes?cliente=${clientId}&period=ano`;

export const linkTarefa = (taskId: string) => `/tarefas?highlight=${taskId}`;

/** Tarefas só da cliente (filtro na tela de Tarefas). */
export const linkTarefasCliente = (clientId: string) => `/tarefas?cliente=${clientId}`;

/** Planejamentos da cliente. */
export const linkPlanejamentosCliente = (clientId: string) => `/planejador?cliente=${clientId}`;

/** Ficha da cliente já abrindo "Agendar sem disparos" (reserva). */
export const linkAgendarCliente = (clientId: string) => `/clientes/${clientId}?acao=agendar`;

/** Ficha da cliente já abrindo "+ Nova locação" (calculadora). */
export const linkNovaLocacaoCliente = (clientId: string) => `/clientes/${clientId}?acao=locacao`;

export const linkPlanejamento = (id: string) => `/planejador/${id}`;

/** Onde o cartão do assistente deixa o planejamento montado pela IA para o planejador abrir (?ia=1). */
export const CHAVE_PLANO_IA = "harmonize-planejamento-ia";

/** Novo planejamento já amarrado à cliente e, se houver, ao atendimento. */
export function linkNovoPlanejamento(clientId?: string | null, eventId?: string | null): string {
  const p = new URLSearchParams();
  if (clientId) p.set("cliente", clientId);
  if (eventId) p.set("evento", eventId);
  const q = p.toString();
  return q ? `/planejador/novo?${q}` : "/planejador/novo";
}

/**
 * Para onde leva uma linha de Movimentações (histórico), pela entidade.
 * Lançamento, locação e atendimento abrem o item; o resto, a lista certa.
 */
export function linkDaMovimentacao(
  entidade: string,
  entidadeId: string | null,
  extra?: { client_id?: string | null } | null
): string | null {
  if (!entidadeId) return null;
  switch (entidade) {
    case "clients":
    case "cliente":
      return linkCliente(entidadeId);
    case "tasks":
      return linkTarefa(entidadeId);
    case "calendar_events":
      return linkEvento(entidadeId);
    case "transactions":
      return linkLancamento(entidadeId);
    case "rentals":
      return extra?.client_id ? linkLocacao(extra.client_id, entidadeId) : null;
    case "planejamento":
      return linkPlanejamento(entidadeId);
    case "envio_agenda":
      return extra?.client_id ? linkCliente(extra.client_id) : null;
    case "emprestimos":
      return "/financeiro/emprestimos";
    case "equipments":
      return "/equipamentos";
    case "cartoes":
      return "/financeiro/cartoes";
    case "categories":
      return "/configuracoes?secao=categorias";
    case "contas_pix":
      return "/configuracoes?secao=contasPix";
    case "cidades_coordenadas":
      return "/configuracoes?secao=cidades";
    default:
      return null;
  }
}
