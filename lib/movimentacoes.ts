// Rótulos e formatação do histórico de movimentações (registrar_movimentacao),
// compartilhados entre a tela geral (/movimentacoes) e o histórico embutido
// na ficha do cliente. Ficam num lugar só para as duas telas nunca
// divergirem sobre o que cada ação/entidade significa.

export interface Movimentacao {
  id: string;
  ocorrido_em: string;
  usuario_nome: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  descricao: string;
  detalhes: Record<string, any> | null;
}

export const ACAO_META: Record<string, { label: string; classe: string }> = {
  criado: { label: "Criado", classe: "bg-brand-teal/10 text-brand-teal" },
  editado: { label: "Editado", classe: "bg-brand-blue/10 text-brand-blue" },
  confirmado: { label: "Confirmado", classe: "bg-brand-teal/10 text-brand-teal" },
  desconfirmado: { label: "Desconfirmado", classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  reagendado: { label: "Reagendado", classe: "bg-brand-blue/10 text-brand-blue" },
  cancelado: { label: "Cancelado", classe: "bg-brand-pink/10 text-brand-pink" },
  excluido: { label: "Excluído", classe: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  realizado: { label: "Realizado", classe: "bg-brand-blue/10 text-brand-blue" },
  realizacao_desfeita: { label: "Realizado desfeito", classe: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  pago: { label: "Pago", classe: "bg-brand-teal/10 text-brand-teal" },
  pagamento_desfeito: { label: "Pagamento desfeito", classe: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  taxa_pendente: { label: "Taxa cobrada", classe: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  taxa_paga: { label: "Taxa recebida", classe: "bg-brand-teal/10 text-brand-teal" },
  taxa_perdida: { label: "Taxa perdida", classe: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  taxa_isenta: { label: "Taxa isentada", classe: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300" },
  pedido_confirmacao_enviado: { label: "Pedido de confirmação enviado", classe: "bg-brand-blue/10 text-brand-blue" },
};

export const ENTIDADE_LABEL: Record<string, string> = {
  rentals: "Locação",
  transactions: "Financeiro",
  calendar_events: "Agenda",
  clients: "Cliente",
  tasks: "Tarefa",
  mentoring_events: "Mentoria",
};

export function formatarDataHora(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Transforma o jsonb de detalhes numa frase. Cada tipo de movimentação
// guarda campos diferentes, e é justamente esse conteúdo que responde o
// "de quando para quando" que o pedido exige no reagendamento.
export function descreverDetalhes(m: Movimentacao): string | null {
  const d = m.detalhes;
  if (!d) return null;

  if (d.data_antiga && d.data_nova) {
    return `De ${d.data_antiga} para ${d.data_nova}`;
  }
  if (d.status_antigo && d.status_novo) {
    return `Status: ${d.status_antigo} → ${d.status_novo}`;
  }
  if (d.valor_antigo !== undefined && d.valor_novo !== undefined) {
    return `Valor: ${d.valor_antigo} → ${d.valor_novo}`;
  }
  if (Array.isArray(d.itens) && d.itens.length > 0) {
    return `Levou junto: ${d.itens.join(", ")}`;
  }
  if (d.cliente_antigo && d.cliente_novo) {
    return `Cliente: ${d.cliente_antigo} → ${d.cliente_novo}`;
  }
  if (typeof d.acao_detalhada === "string") {
    return d.acao_detalhada;
  }
  return null;
}
