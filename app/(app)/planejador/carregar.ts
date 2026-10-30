import type { SupabaseClient } from "@supabase/supabase-js";

const nomeDe = (c: any) => (c ? [c.treatment, c.display_name || c.name].filter(Boolean).join(" ") : null);
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/** Nome com tratamento, como vai no campo "Profissional" do planejador. */
export const nomeProfissional = nomeDe;

/** Clientes para o seletor do editor e o filtro da lista. */
export async function carregarClientes(supabase: SupabaseClient) {
  const { data } = await supabase.from("clients").select("id, name, display_name, treatment, city, whatsapp").eq("is_test", false).order("name");
  return (data ?? []).map((c: any) => ({ id: c.id, name: c.name, city: c.city, whatsapp: c.whatsapp, profissional: nomeDe(c) as string }));
}

/** Atendimento (para a data) e cliente de um planejamento novo vindo por atalho. */
export async function carregarContexto(supabase: SupabaseClient, clienteId?: string | null, eventoId?: string | null) {
  let evento: { id: string; date_start: string; client_id: string | null } | null = null;
  if (eventoId) {
    const { data } = await supabase.from("calendar_events").select("id, date_start, client_id").eq("id", eventoId).maybeSingle();
    evento = data ?? null;
  }
  return { clienteId: clienteId || evento?.client_id || null, evento };
}

export { um };

const COLUNAS_LISTA =
  "id, client_id, calendar_event_id, paciente, data, data_retorno, procedimento, saldo_total, total_disparos, updated_at, sessoes_total:estado->>sessoesTotal, sessao_atual:estado->>sessaoAtual";
const COLUNAS_PACIENTE = "id, client_id, nome, whatsapp, nascimento, observacoes";
const DO_DONO = ", clients(name, display_name, treatment), autor:profiles!planejamentos_created_by_fkey(cliente_id)";

/**
 * Planejamentos da lista e os cadastros de paciente. Antes do SQL dos pacientes
 * (2026-10-30-pacientes.sql) a coluna paciente_id e a tabela pacientes não
 * existem: a lista carrega sem elas e junta os pacientes pelo nome.
 */
export async function carregarListaPlanejador(supabase: SupabaseClient, portal = false) {
  const extra = portal ? "" : DO_DONO;
  const consulta = (colunas: string) =>
    supabase.from("planejamentos").select(colunas).order("data", { ascending: false }).order("updated_at", { ascending: false }).limit(1000);
  const consultaPacientes = (colunas: string) => supabase.from("pacientes").select(colunas).order("nome").limit(5000);
  const [planos, pacientesComFotos] = await Promise.all([
    consulta(COLUNAS_LISTA + ", paciente_id" + extra),
    consultaPacientes(COLUNAS_PACIENTE + ", fotos_autorizadas_em"),
  ]);
  let pacientes = pacientesComFotos;
  // Antes do SQL das fotos a coluna fotos_autorizadas_em não existe.
  if (pacientes.error && (pacientes.error.code === "42703" || /fotos_autorizadas_em/.test(pacientes.error.message ?? ""))) {
    pacientes = await consultaPacientes(COLUNAS_PACIENTE);
  }
  let { data, error } = planos as { data: any[] | null; error: { code?: string; message?: string } | null };
  if (error && (error.code === "42703" || /paciente_id/.test(error.message ?? ""))) {
    ({ data, error } = (await consulta(COLUNAS_LISTA + extra)) as { data: any[] | null; error: { code?: string; message?: string } | null });
  }
  const lista = (data ?? []).map((p: any) => ({
    ...p,
    clients: undefined,
    autor: undefined,
    paciente_id: p.paciente_id ?? null,
    cliente_nome: portal ? null : nomeDe(um(p.clients)),
    pela_cliente: portal ? false : !!um<any>(p.autor)?.cliente_id,
    sessoes_total: Number(p.sessoes_total) || undefined,
    sessao_atual: Number(p.sessao_atual) || undefined,
  }));
  return {
    lista,
    pacientes: (pacientes.error ? [] : pacientes.data ?? []) as unknown as import("@/lib/pacientes").PacienteCadastro[],
    temCadastro: !pacientes.error,
    erro: error ? "Não consegui carregar os planejamentos." : null,
  };
}

/** Um cadastro de paciente (a RLS só devolve o que quem está logado pode ver). */
export async function carregarPaciente(supabase: SupabaseClient, id?: string | null) {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("pacientes").select("id, client_id, nome").eq("id", id).maybeSingle();
  return (data as { id: string; client_id: string | null; nome: string } | null) ?? null;
}
