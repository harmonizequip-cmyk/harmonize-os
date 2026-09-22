import { createClient } from "@/lib/supabase/server";
import MovimentacoesClient from "./MovimentacoesClient";

// Histórico de movimentações (item 4 da auditoria, primeira metade): toda
// ação e mudança de status, com data, hora e usuário. É uma tela separada
// do histórico de locações realizadas de propósito; misturar as duas foi
// justamente o que o pedido proibiu.
//
// A tabela movimentacoes não tem policy de insert, update nem delete: ela
// só é escrita pelas funções do banco. Então esta tela é, por construção,
// somente leitura.
export default async function MovimentacoesPage() {
  const supabase = createClient();

  const { data: movimentacoes } = await supabase
    .from("movimentacoes")
    .select("id, ocorrido_em, usuario_nome, acao, entidade, entidade_id, descricao, detalhes")
    .order("ocorrido_em", { ascending: false })
    .limit(500);

  return <MovimentacoesClient initialRows={movimentacoes ?? []} />;
}
