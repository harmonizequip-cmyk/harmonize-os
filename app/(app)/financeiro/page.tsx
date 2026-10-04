import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/period";
import FinanceiroClient from "./FinanceiroClient";

// Teto de segurança. Com período obrigatório, um mês de lançamentos fica
// muito abaixo disso; o teto existe para uma consulta absurda não travar
// a tela. Quando ele é atingido, a tela avisa em vez de mostrar um total
// menor do que a realidade calado, que era o risco do limit(200) antigo.
const TETO = 2000;

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: {
    period?: string;
    from?: string;
    to?: string;
    tipo?: string;
    categoria?: string;
    pagamento?: string;
    cliente?: string;
    q?: string;
  };
}) {
  const supabase = createClient();

  // O padrão é o mês corrente, não "hoje": no Financeiro a pergunta é
  // quanto entrou e saiu no mês, e abrir a tela em "hoje" mostraria quase
  // sempre uma tela vazia.
  const periodo = resolverPeriodo(searchParams.period ?? "mes", searchParams.from, searchParams.to);

  // Lê da view transactions_contabilizaveis, não da tabela transactions.
  // A view exclui modo teste e lançamento preso a locação cancelada, que
  // é a mesma regra usada por Dashboard e Relatórios.
  let consulta = supabase
    .from("transactions_contabilizaveis")
    .select(
      "id, type, description, amount, payment_method, date, category_id, client_id, rental_id, is_test, categories(name), clients(name)"
    )
    .eq("scope", "harmonize")
    .gte("date", periodo.inicio)
    .lte("date", periodo.fim);

  // Cada filtro vira condição na consulta, e não peneira no navegador:
  // assim a tela nunca baixa o que não vai mostrar, e o total sai da
  // mesma consulta que a lista.
  if (searchParams.tipo === "entrada" || searchParams.tipo === "saida") {
    consulta = consulta.eq("type", searchParams.tipo);
  }
  if (searchParams.categoria) consulta = consulta.eq("category_id", searchParams.categoria);
  if (searchParams.pagamento) consulta = consulta.eq("payment_method", searchParams.pagamento);
  if (searchParams.cliente) consulta = consulta.eq("client_id", searchParams.cliente);
  if (searchParams.q?.trim()) {
    // Escapa % e _ para quem digitar esses caracteres não virar curinga.
    const termo = searchParams.q.trim().replace(/[%_]/g, "\\$&");
    consulta = consulta.ilike("description", `%${termo}%`);
  }

  const [{ data: transactions }, { data: categories }, { data: clients }] = await Promise.all([
    consulta.order("date", { ascending: false }).limit(TETO),
    supabase.from("categories").select("id, name, type").eq("scope", "harmonize").order("name"),
    supabase.from("clients").select("id, name").order("name"),
  ]);

  // O Supabase retorna as relações "categories"/"clients" como objeto único
  // em tempo de execução (cada lançamento tem só um de cada), mas sem os
  // tipos gerados do banco o TypeScript infere como array. Normalizamos
  // aqui para o formato real, cobrindo os dois formatos possíveis com segurança.
  // Data da locação de cada lançamento ligado a uma, para a lista mostrar
  // o vínculo. Vai em consulta à parte, em lotes, porque a relação não é
  // embutível a partir da view.
  const rentalIds = Array.from(new Set((transactions ?? []).map((t: any) => t.rental_id).filter(Boolean))) as string[];
  const dataDaLocacao = new Map<string, string>();
  for (let i = 0; i < rentalIds.length; i += 100) {
    const { data: locs } = await supabase
      .from("rentals")
      .select("id, event_date")
      .in("id", rentalIds.slice(i, i + 100));
    for (const l of locs ?? []) dataDaLocacao.set(l.id, l.event_date);
  }

  const normalizedTransactions = (transactions ?? []).map((t: any) => ({
    ...t,
    rental_date: t.rental_id ? (dataDaLocacao.get(t.rental_id) ?? null) : null,
    categories: Array.isArray(t.categories) ? (t.categories[0] ?? null) : (t.categories ?? null),
    clients: Array.isArray(t.clients) ? (t.clients[0] ?? null) : (t.clients ?? null),
  }));

  return (
    <FinanceiroClient
      initialTransactions={normalizedTransactions}
      categories={categories ?? []}
      clients={clients ?? []}
      periodo={periodo}
      atingiuTeto={normalizedTransactions.length >= TETO}
    />
  );
}
