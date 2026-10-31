// Carrega os dados do lembrete de importar fatura: cartões ativos e, de cada um,
// a hora da última linha importada (transactions com importacao_chave). Serve
// no servidor (Dashboard) e no navegador (balão). Erro sobe: quem chama decide.

import type { SupabaseClient } from "@supabase/supabase-js";
import { lembretesDeFatura, type CartaoParaLembrete, type LembreteFatura } from "@/lib/lembrete-fatura";

export async function carregarLembretesFatura(supabase: SupabaseClient, hoje: string): Promise<LembreteFatura[]> {
  const { data: cartoes, error } = await supabase
    .from("cartoes")
    .select("id, nome, scope, dia_fechamento, dia_vencimento")
    .eq("ativo", true);
  if (error) throw error;
  const lista = (cartoes ?? []) as Omit<CartaoParaLembrete, "ultimaImportacao">[];
  if (lista.length === 0) return [];
  // Uma consulta por cartão (são poucos), só a linha importada mais recente.
  const ultimas = await Promise.all(
    lista.map(async (c) => {
      const { data, error: e } = await supabase
        .from("transactions")
        .select("created_at")
        .eq("cartao_id", c.id)
        .not("importacao_chave", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      if (e) throw e;
      return ((data ?? [])[0]?.created_at as string | undefined) ?? null;
    }),
  );
  return lembretesDeFatura(
    hoje,
    lista.map((c, i) => ({ ...c, ultimaImportacao: ultimas[i] })),
  );
}
