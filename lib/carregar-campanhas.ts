import type { SupabaseClient } from "@supabase/supabase-js";
import { buscarTodas } from "./buscar-todas";
import {
  contarPorStatus,
  conversoesDaCampanha,
  totalRecebidos,
  type Conversao,
  type EnvioCampanha,
  type EventoParaConversao,
  type StatusEnvio,
} from "./campanhas";

// Carga das campanhas (tabelas campanhas e campanha_envios). Se o SQL das
// campanhas ainda não rodou no banco, as telas mostram um aviso em vez de quebrar.

export const PASTA_CAMPANHAS = "campanhas";

export interface CampanhaRow {
  id: string;
  nome: string;
  mensagem: string;
  arte_path: string | null;
  arte_nome: string | null;
  filtros: unknown;
  limite_diario: number;
  arquivada: boolean;
  created_at: string;
  updated_at: string;
}

/** Envio com o cadastro da cliente (nome e cidade) para a lista de resultado. */
export interface EnvioComCliente extends EnvioCampanha {
  id: string;
  cliente: { name: string; display_name: string | null; treatment: string | null; city: string | null } | null;
}

export interface CampanhaNaLista extends CampanhaRow {
  contagem: Record<StatusEnvio, number>;
  recebidos: number;
  /** Quem recebeu e depois ganhou atendimento na agenda (conversoesDaCampanha). */
  adquiriram: number;
  valorAdquirido: number;
}

/**
 * Atendimentos criados a partir da primeira hora de envio, só das pessoas que receberam.
 * Se a leitura falhar devolve lista vazia e o erro (a tela segue, sem o bloco).
 */
export async function carregarEventosParaConversao(
  supabase: SupabaseClient,
  envios: Pick<EnvioCampanha, "client_id" | "enviado_em">[]
): Promise<{ eventos: EventoParaConversao[]; erro: string | null }> {
  const enviados = envios.filter((e) => !!e.enviado_em);
  if (!enviados.length) return { eventos: [], erro: null };
  const ids = Array.from(new Set(enviados.map((e) => e.client_id)));
  const desde = enviados.reduce((m, e) => (e.enviado_em! < m ? e.enviado_em! : m), enviados[0].enviado_em!);
  const eventos: EventoParaConversao[] = [];
  for (let i = 0; i < ids.length; i += 80) {
    const lote = ids.slice(i, i + 80);
    const { data, error } = await supabase
      .from("calendar_events")
      .select("id, client_id, created_at, date_start, event_type, status, is_test, value, rental:rentals(calculated_value, status, is_test)")
      .in("client_id", lote)
      .gte("created_at", desde)
      .neq("status", "cancelada")
      .limit(1000);
    if (error) return { eventos: [], erro: error.message };
    for (const e of (data ?? []) as any[]) eventos.push({ ...e, rental: Array.isArray(e.rental) ? e.rental[0] ?? null : e.rental ?? null });
  }
  return { eventos, erro: null };
}

const COLUNAS = "id, nome, mensagem, arte_path, arte_nome, filtros, limite_diario, arquivada, created_at, updated_at";

/** Tabela que ainda não existe (SQL não rodado): Postgres 42P01 ou PostgREST PGRST205. */
export function ehFaltaDeTabela(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return /campanha/i.test(m) && /(does not exist|could not find|não existe)/i.test(m);
}

/** Lista com a contagem de envios por situação. */
export async function carregarListaCampanhas(
  supabase: SupabaseClient
): Promise<{ faltaSql: true } | { faltaSql: false; campanhas: CampanhaNaLista[] }> {
  const { data, error } = await supabase.from("campanhas").select(COLUNAS).order("created_at", { ascending: false });
  if (ehFaltaDeTabela(error)) return { faltaSql: true };
  if (error) throw new Error(`Não consegui carregar as campanhas: ${error.message}`);
  const envios = await buscarTodas<Pick<EnvioCampanha, "campanha_id" | "client_id" | "status" | "enviado_em"> & { id: string }>((de, ate) =>
    supabase.from("campanha_envios").select("id, campanha_id, client_id, status, enviado_em").order("id").range(de, ate)
  );
  const { eventos } = await carregarEventosParaConversao(supabase, envios);
  const porCampanha = new Map<string, typeof envios>();
  for (const e of envios) {
    const l = porCampanha.get(e.campanha_id) ?? [];
    l.push(e);
    porCampanha.set(e.campanha_id, l);
  }
  return {
    faltaSql: false,
    campanhas: ((data ?? []) as CampanhaRow[]).map((c) => {
      const l = porCampanha.get(c.id) ?? [];
      const conv = conversoesDaCampanha(l, eventos);
      return {
        ...c,
        contagem: contarPorStatus(l),
        recebidos: totalRecebidos(l),
        adquiriram: conv.length,
        valorAdquirido: conv.reduce((s, x) => s + (x.valor ?? 0), 0),
      };
    }),
  };
}

/** Uma campanha, os envios dela e quem não quer receber nenhuma campanha. */
export async function carregarCampanha(
  supabase: SupabaseClient,
  id: string | null
): Promise<
  | { faltaSql: true }
  | { faltaSql: false; campanha: CampanhaRow | null; envios: EnvioComCliente[]; naoQuer: string[]; conversoes: Conversao[]; erroConversoes: string | null }
> {
  let campanha: CampanhaRow | null = null;
  if (id) {
    const { data, error } = await supabase.from("campanhas").select(COLUNAS).eq("id", id).maybeSingle();
    if (ehFaltaDeTabela(error)) return { faltaSql: true };
    if (error) throw new Error(`Não consegui carregar a campanha: ${error.message}`);
    campanha = (data as CampanhaRow | null) ?? null;
  } else {
    const { error } = await supabase.from("campanhas").select("id").limit(1);
    if (ehFaltaDeTabela(error)) return { faltaSql: true };
    if (error) throw new Error(`Não consegui carregar as campanhas: ${error.message}`);
  }
  const [envios, recusas] = await Promise.all([
    campanha
      ? buscarTodas<any>((de, ate) =>
          supabase
            .from("campanha_envios")
            .select("id, campanha_id, client_id, status, mensagem, enviado_em, atualizado_em, cliente:clients(name, display_name, treatment, city)")
            .eq("campanha_id", campanha!.id)
            .order("id")
            .range(de, ate)
        )
      : Promise.resolve([] as EnvioComCliente[]),
    buscarTodas<{ id: string; client_id: string }>((de, ate) =>
      supabase.from("campanha_envios").select("id, client_id").eq("status", "nao_quer").order("id").range(de, ate)
    ),
  ]);
  // A cliente vem como objeto (chave estrangeira única); por garantia, aceita lista.
  const comCliente: EnvioComCliente[] = envios.map((e: any) => ({ ...e, cliente: Array.isArray(e.cliente) ? e.cliente[0] ?? null : e.cliente ?? null }));
  const { eventos, erro: erroConversoes } = await carregarEventosParaConversao(supabase, comCliente);
  return {
    faltaSql: false,
    campanha,
    envios: comCliente,
    naoQuer: Array.from(new Set(recusas.map((r) => r.client_id))),
    conversoes: conversoesDaCampanha(comCliente, eventos),
    erroConversoes,
  };
}
