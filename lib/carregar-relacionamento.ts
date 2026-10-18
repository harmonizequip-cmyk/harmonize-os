import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarPendencias } from "./pendencias";
import { buscarTodas } from "./buscar-todas";
import { classificarTodas, type PessoaBase, type PessoaClassificada } from "./relacionamento";

// Busca todas as páginas e troca a mensagem de erro genérica por uma que diz o que faltou.
async function carregar(
  oque: string,
  consulta: (de: number, ate: number) => PromiseLike<{ data: any[] | null; error: { message: string } | null }>
): Promise<any[]> {
  try {
    return await buscarTodas<any>(consulta);
  } catch (e) {
    throw new Error(`Não consegui carregar ${oque} do Relacionamento: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function dataLocal(iso: string | null | undefined): string | null {
  if (!iso) return null;
  if (iso.length <= 10) return iso;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(iso));
}

function maior(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Junta tudo o que a classificação precisa, em poucas consultas: clientes e
 * leads (fora teste e desqualificado), locações que contam, próximas reservas,
 * último contato (tarefas concluídas, agenda enviada, pedido de confirmação),
 * tarefas pendentes e quem deve.
 */
export async function carregarRelacionamento(supabase: SupabaseClient, hoje: string): Promise<PessoaClassificada[]> {
  // Tudo em páginas (o Supabase corta em 1000 linhas) e com ordem fixa. Qualquer
  // erro derruba a carga: sem locações ou contatos todo mundo viraria "Sumida"/"Fria".
  const [clientes, locacoesRows, reservasRows, tarefasRows, enviosRows, confirmacoesRows] = await Promise.all([
    carregar("os clientes", (de, ate) =>
      supabase
        .from("clients")
        .select("id, name, display_name, treatment, whatsapp, city, stage, is_client, parceiro, created_at")
        .eq("is_test", false)
        .neq("stage", "desqualificado")
        .order("id")
        .range(de, ate)
    ),
    carregar("as locações", (de, ate) =>
      supabase.from("rentals_contabilizaveis").select("id, client_id, event_date, calculated_value").order("id").range(de, ate)
    ),
    carregar("as próximas reservas", (de, ate) =>
      supabase
        .from("calendar_events")
        .select("id, client_id, date_start")
        .eq("is_test", false)
        .neq("status", "cancelada")
        .not("client_id", "is", null)
        .gte("date_end", hoje)
        .order("id")
        .range(de, ate)
    ),
    carregar("as tarefas", (de, ate) =>
      supabase
        .from("tasks")
        .select("id, client_id, status, completed_at")
        .eq("is_test", false)
        .not("client_id", "is", null)
        .order("id")
        .range(de, ate)
    ),
    carregar("os envios da agenda", (de, ate) => supabase.from("agenda_envios").select("id, client_id, enviado_em").order("id").range(de, ate)),
    carregar("os pedidos de confirmação", (de, ate) =>
      supabase
        .from("calendar_events")
        .select("id, client_id, confirmation_message_sent_at")
        .not("confirmation_message_sent_at", "is", null)
        .not("client_id", "is", null)
        .order("id")
        .range(de, ate)
    ),
  ]);

  const locacoes = new Map<string, { data: string; valor: number }[]>();
  for (const r of locacoesRows) {
    if (!r.client_id) continue;
    const l = locacoes.get(r.client_id) ?? [];
    l.push({ data: r.event_date, valor: Number(r.calculated_value ?? 0) });
    locacoes.set(r.client_id, l);
  }

  const proxima = new Map<string, string>();
  // A mais cedo de cada pessoa (a consulta vem por id, não por data).
  for (const e of reservasRows) {
    const d = e.date_start < hoje ? hoje : e.date_start;
    const atual = proxima.get(e.client_id);
    if (!atual || d < atual) proxima.set(e.client_id, d);
  }

  const contato = new Map<string, string>();
  const pendentes = new Map<string, number>();
  for (const t of tarefasRows) {
    if (t.status === "concluida") contato.set(t.client_id, maior(contato.get(t.client_id), dataLocal(t.completed_at)) as string);
    else pendentes.set(t.client_id, (pendentes.get(t.client_id) ?? 0) + 1);
  }
  for (const e of enviosRows) contato.set(e.client_id, maior(contato.get(e.client_id), dataLocal(e.enviado_em)) as string);
  for (const e of confirmacoesRows)
    contato.set(e.client_id, maior(contato.get(e.client_id), dataLocal(e.confirmation_message_sent_at)) as string);

  let deve = new Map<string, number>();
  try {
    const p = await buscarPendencias(supabase, hoje);
    deve = new Map(p.clientes.map((c) => [c.clientId, c.total]));
  } catch {
    // Sem o "deve" a classificação segue; é só um selo.
  }

  const pessoas: PessoaBase[] = clientes.map((c) => ({
    id: c.id,
    nome: c.name,
    treatment: c.treatment,
    displayName: c.display_name,
    whatsapp: c.whatsapp,
    cidade: c.city,
    stage: c.stage,
    ehCliente: !!c.is_client,
    parceiro: !!c.parceiro,
    criadoEm: dataLocal(c.created_at) ?? hoje,
    locacoes: locacoes.get(c.id) ?? [],
    proximaReserva: proxima.get(c.id) ?? null,
    ultimoContato: contato.get(c.id) ?? null,
    deve: deve.get(c.id) ?? 0,
    tarefasPendentes: pendentes.get(c.id) ?? 0,
  }));

  return classificarTodas(pessoas, hoje);
}
