// Categorias de lançamento (tabela categories). Desde 24/10/2026 o dono cuida
// delas em Configurações > Categorias: as do sistema têm cadeado, as outras se
// renomeiam, arquivam e apagam (só sem lançamento). Os lançamentos guardam o
// id da categoria, então renomear não mexe neles.
//
// As telas que oferecem categoria para escolher leem com select("*") e passam
// por `paraEscolha`: assim funcionam antes e depois da migration (sem a coluna
// `arquivada`, nada é escondido) e mantêm a ordem alfabética de sempre.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface CategoriaLinha {
  id: string;
  name: string;
  type?: "entrada" | "saida" | string;
  scope?: "harmonize" | "pessoal" | string;
  sistema?: boolean | null;
  arquivada?: boolean | null;
  ordem?: number | null;
}

/** Nomes que o banco ou as telas procuram (cadeado). Reserva se a coluna `sistema` ainda não existir. */
export const CATEGORIAS_DO_SISTEMA: { scope: string; type: string; name: string }[] = [
  { scope: "harmonize", type: "entrada", name: "Locação" },
  { scope: "harmonize", type: "entrada", name: "Mentoria" },
  { scope: "harmonize", type: "entrada", name: "Taxa de reserva" },
  { scope: "harmonize", type: "entrada", name: "Deslocamento" },
  { scope: "harmonize", type: "entrada", name: "Devolução de empréstimo" },
  { scope: "harmonize", type: "saida", name: "Retiradas" },
  { scope: "harmonize", type: "saida", name: "Outros" },
  { scope: "harmonize", type: "saida", name: "Empréstimo concedido" },
  { scope: "harmonize", type: "saida", name: "Pagamento de fatura" },
  { scope: "pessoal", type: "entrada", name: "Retirada da Harmonize" },
  { scope: "pessoal", type: "saida", name: "Pagamento de fatura" },
];

export function ehDoSistema(c: CategoriaLinha): boolean {
  if (typeof c.sistema === "boolean") return c.sistema;
  return CATEGORIAS_DO_SISTEMA.some((s) => s.scope === (c.scope ?? "harmonize") && s.type === c.type && s.name === c.name);
}

export function ordenarCategorias<T extends CategoriaLinha>(lista: T[]): T[] {
  return [...lista].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * Lista para escolher numa tela: sem as arquivadas (menos a que já está no
 * lançamento sendo editado, `manterId`), na ordem da tabela.
 */
export function paraEscolha<T extends CategoriaLinha>(lista: T[] | null | undefined, manterId?: string | null): T[] {
  return ordenarCategorias((lista ?? []).filter((c) => !c.arquivada || (manterId && c.id === manterId)));
}

/** Mesmo critério do banco: espaços extras saem. */
export function limparNomeCategoria(nome: string): string {
  return nome.trim().replace(/\s+/g, " ");
}

const sem = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Por que o nome não pode ser usado (mesma regra de salvar_categoria), ou null.
 * `lista` = todas as categorias do mesmo espaço.
 */
export function problemaNomeCategoria(
  nome: string,
  alvo: { id?: string | null; scope: string; type: string },
  lista: CategoriaLinha[]
): string | null {
  const n = limparNomeCategoria(nome);
  if (!n) return "Escreva o nome da categoria.";
  if (n.length > 60) return "Nome longo demais (máximo 60 caracteres).";
  const baixo = n.toLowerCase();
  if (alvo.type === "entrada" && /^(taxa|loca|mentoria|deslocamento)/.test(baixo)) {
    return "Nome reservado: entradas começando com Taxa, Loca, Mentoria ou Deslocamento são do sistema.";
  }
  const mesmoEspaco = lista.filter((c) => (c.scope ?? "harmonize") === alvo.scope && c.id !== alvo.id);
  if (mesmoEspaco.some((c) => ehDoSistema(c) && c.name.trim().toLowerCase() === baixo)) {
    return "Já existe uma categoria do sistema com esse nome.";
  }
  if (mesmoEspaco.some((c) => c.type === alvo.type && c.name.trim().toLowerCase() === baixo)) {
    return `Já existe a categoria "${n}" nesta lista.`;
  }
  // Aviso suave: mesmo nome sem acento já existe (ex.: "Saude" e "Saúde").
  if (mesmoEspaco.some((c) => c.type === alvo.type && sem(c.name) === sem(n))) {
    return `Já existe uma categoria parecida ("${mesmoEspaco.find((c) => c.type === alvo.type && sem(c.name) === sem(n))!.name}").`;
  }
  return null;
}

/** Quantos lançamentos cada categoria tem (view categorias_uso; vazio se ainda não existir). */
export async function buscarUsoCategorias(supabase: SupabaseClient): Promise<Record<string, number>> {
  const { data, error } = await supabase.from("categorias_uso").select("category_id, lancamentos");
  if (error || !data) return {};
  return Object.fromEntries((data as { category_id: string; lancamentos: number }[]).map((u) => [u.category_id, u.lancamentos]));
}
