import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/period";
import MovimentacoesClient from "./MovimentacoesClient";

// Histórico de movimentações (item 4 da auditoria, primeira metade): toda
// ação e mudança de status, com data, hora e usuário. É uma tela separada
// do histórico de locações realizadas de propósito; misturar as duas foi
// justamente o que o pedido proibiu.
//
// A tabela movimentacoes não tem policy de insert, update nem delete: ela
// só é escrita pelas funções do banco. Então esta tela é, por construção,
// somente leitura.
const TETO = 2000;

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: {
    period?: string;
    from?: string;
    to?: string;
    acao?: string;
    entidade?: string;
    q?: string;
  };
}) {
  const supabase = createClient();

  // Este histórico só cresce, então antes o limite de 500 linhas ia, com o
  // tempo, esconder o começo do período sem avisar. Com período na
  // consulta, o recorte é explícito e a tela avisa se bater no teto.
  const periodo = resolverPeriodo(searchParams.period ?? "mes", searchParams.from, searchParams.to);

  let consulta = supabase
    .from("movimentacoes")
    .select("id, ocorrido_em, usuario_nome, acao, entidade, entidade_id, descricao, detalhes")
    // ocorrido_em tem hora; o fim do período precisa alcançar o dia
    // inteiro, por isso a comparação é com o dia seguinte, exclusiva.
    .gte("ocorrido_em", `${periodo.inicio}T00:00:00`)
    .lt("ocorrido_em", `${periodo.fim}T23:59:59.999`);

  if (searchParams.acao) consulta = consulta.eq("acao", searchParams.acao);
  if (searchParams.entidade) consulta = consulta.eq("entidade", searchParams.entidade);
  if (searchParams.q?.trim()) {
    const termo = searchParams.q.trim().replace(/[%_]/g, "\\$&");
    consulta = consulta.ilike("descricao", `%${termo}%`);
  }

  const { data: movimentacoes } = await consulta
    .order("ocorrido_em", { ascending: false })
    .limit(TETO);

  return (
    <MovimentacoesClient
      initialRows={movimentacoes ?? []}
      periodo={periodo}
      atingiuTeto={(movimentacoes ?? []).length >= TETO}
    />
  );
}
