// Cérebro (tela /insights): categorias e ordem dos insights gerados pela IA.

export type CategoriaInsight = "prospeccao" | "relacionamento" | "vendas" | "financeiro" | "agenda" | "marketing" | "operacao";

export interface Insight {
  id: string;
  categoria: CategoriaInsight;
  titulo: string;
  texto: string;
  acao: string | null;
  evidencia: string | null;
  impacto: number;
  client_ids: string[];
  status: "novo" | "feito" | "arquivado";
  util: boolean | null;
  created_at: string;
}

export const CATEGORIAS_INSIGHT: { id: CategoriaInsight; rotulo: string; emoji: string; cor: string }[] = [
  { id: "prospeccao", rotulo: "Prospecção", emoji: "🎯", cor: "bg-sky-50 text-sky-700 border-sky-200" },
  { id: "relacionamento", rotulo: "Relacionamento", emoji: "🤝", cor: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "vendas", rotulo: "Vendas", emoji: "💎", cor: "bg-violet-50 text-violet-700 border-violet-200" },
  { id: "financeiro", rotulo: "Financeiro", emoji: "💰", cor: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { id: "agenda", rotulo: "Agenda", emoji: "📅", cor: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "marketing", rotulo: "Marketing", emoji: "📣", cor: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200" },
  { id: "operacao", rotulo: "Operação", emoji: "⚙️", cor: "bg-neutral-100 text-neutral-700 border-neutral-200" },
];

export function categoriaInfo(id: string) {
  return CATEGORIAS_INSIGHT.find((c) => c.id === id) ?? CATEGORIAS_INSIGHT[CATEGORIAS_INSIGHT.length - 1];
}

/** Novos primeiro (maior impacto, depois mais recente); feitos e arquivados no fim. */
export function ordenarInsights(lista: Insight[]): Insight[] {
  const peso = { novo: 0, feito: 1, arquivado: 2 } as const;
  return [...lista].sort(
    (a, b) =>
      peso[a.status] - peso[b.status] ||
      (a.status === "novo" ? b.impacto - a.impacto : 0) ||
      b.created_at.localeCompare(a.created_at)
  );
}

/** Pergunta para aprofundar um insight no assistente. */
export function perguntaParaAprofundar(i: Pick<Insight, "titulo" | "acao">): string {
  return `Quero colocar em prática este insight: "${i.titulo}". ${i.acao ? `Próximo passo sugerido: ${i.acao}` : ""} Me ajude a executar agora, com os dados e as mensagens prontas.`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}
