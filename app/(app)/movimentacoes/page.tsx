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

export default async function MovimentacoesPage(
  props: {
    searchParams: Promise<{
      period?: string;
      from?: string;
      to?: string;
      acao?: string;
      entidade?: string;
      q?: string;
    }>;
  }
) {
  const searchParams = await props.searchParams;
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

  // Locação não guarda a cliente no histórico; o atalho da linha precisa
  // dela para abrir a locação dentro da ficha.
  const idsLocacoes = Array.from(
    new Set((movimentacoes ?? []).filter((m: any) => m.entidade === "rentals" && m.entidade_id).map((m: any) => m.entidade_id))
  ) as string[];
  const clienteDaLocacao = new Map<string, string>();
  for (let i = 0; i < idsLocacoes.length; i += 200) {
    const { data } = await supabase.from("rentals").select("id, client_id").in("id", idsLocacoes.slice(i, i + 200));
    for (const r of data ?? []) if (r.client_id) clienteDaLocacao.set(r.id, r.client_id);
  }
  const linhas = (movimentacoes ?? []).map((m: any) =>
    m.entidade === "rentals" && clienteDaLocacao.has(m.entidade_id) && !m.detalhes?.client_id
      ? { ...m, detalhes: { ...(m.detalhes ?? {}), client_id: clienteDaLocacao.get(m.entidade_id) } }
      : m
  );

  return (
    <MovimentacoesClient
      initialRows={linhas}
      periodo={periodo}
      atingiuTeto={(movimentacoes ?? []).length >= TETO}
    />
  );
}
