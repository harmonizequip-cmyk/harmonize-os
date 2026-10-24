import type { SupabaseClient } from "@supabase/supabase-js";
import { carregarRelacionamento } from "./carregar-relacionamento";
import { oportunidadesDeEncaixe, type Oportunidade } from "./encaixe";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "./preferencias";
import { diasDoPeriodo, somarDias } from "./period";
import type { PessoaClassificada } from "./relacionamento";

/**
 * Dados do encaixe de datas livres: dias ocupados (HIPRO marcado ou bloqueio),
 * atendimentos com a cidade da cliente (para saber onde o Eder vai estar) e a
 * carteira do Relacionamento. `pessoas` pode vir pronta (o Dashboard já carrega).
 */
export async function carregarEncaixe(
  supabase: SupabaseClient,
  hoje: string,
  opcoes: { somenteDia?: string | null; pessoas?: PessoaClassificada[]; encaixe?: Preferencias["encaixe"] } = {}
): Promise<Oportunidade[]> {
  const enc = opcoes.encaixe ?? DEFAULT_PREFERENCIAS.encaixe;
  const ate = somarDias(opcoes.somenteDia && opcoes.somenteDia > hoje ? opcoes.somenteDia : hoje, enc.diasAFrente + 1);
  const de = somarDias(hoje, -1);
  const [{ data: eventos, error: e1 }, { data: bloqueios, error: e2 }, pessoas] = await Promise.all([
    supabase
      .from("calendar_events")
      .select("date_start, date_end, event_type, clients(city)")
      .neq("status", "cancelada")
      .eq("is_test", false)
      .gte("date_start", somarDias(de, -62))
      .lte("date_start", ate),
    supabase.from("bloqueios_equipamento").select("data_inicio, data_fim").lte("data_inicio", ate).gte("data_fim", de),
    opcoes.pessoas ? Promise.resolve(opcoes.pessoas) : carregarRelacionamento(supabase, hoje),
  ]);
  if (e1 || e2) throw new Error(`Não consegui carregar a agenda para o encaixe: ${(e1 ?? e2)!.message}`);

  const ocupados = new Set<string>();
  const comCidade: { data: string; ate: string | null; cidade: string | null }[] = [];
  for (const e of (eventos ?? []) as any[]) {
    const fim = e.date_end ?? e.date_start;
    if (fim < de) continue;
    if (e.event_type === "hipro_1" || e.event_type === "hipro_2") for (const d of diasDoPeriodo(e.date_start, fim)) ocupados.add(d);
    const cli = Array.isArray(e.clients) ? e.clients[0] : e.clients;
    comCidade.push({ data: e.date_start, ate: e.date_end, cidade: cli?.city ?? null });
  }
  for (const b of bloqueios ?? []) for (const d of diasDoPeriodo(b.data_inicio, b.data_fim, 400)) ocupados.add(d);

  return oportunidadesDeEncaixe({ hoje, ocupados, eventos: comCidade, pessoas, somenteDia: opcoes.somenteDia, diasAFrente: enc.diasAFrente, raioKm: enc.raioKm });
}
