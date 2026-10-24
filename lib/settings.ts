import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PRICING,
  RESERVATION_FEE,
  DEFAULT_MENTORIA_PRICING,
  type PricingConfig,
  type MentoriaPricingConfig,
} from "./rental-pricing";
import { lerDespesasFixas, type DespesaFixa } from "./meta-mes";
import { DEFAULT_PREFERENCIAS, diferencasDoPadrao, lerPreferencias, type Preferencias } from "./preferencias";

export interface AppSettings {
  pricing: PricingConfig;
  reservationFee: number;
  inactiveDaysThreshold: number;
  mentoriaPricing: MentoriaPricingConfig;
  diasAteReativar: number;
  recontatoIntervaloDias: number;
  recontatoAutomatico: boolean;
  tarefaConfirmacaoAtiva: boolean;
  diasAntesConfirmacao: number;
  tarefaPosLocacaoAtiva: boolean;
  diasPosLocacao: number;
  tarefaTaxaAtiva: boolean;
  diasCobrancaTaxa: number;
  despesasFixas: DespesaFixa[];
  /** Preferências de Configurações (metas, relacionamento, encaixe...). Ver lib/preferencias.ts. */
  preferencias: Preferencias;
}

export const DEFAULT_SETTINGS: AppSettings = {
  pricing: DEFAULT_PRICING,
  reservationFee: RESERVATION_FEE,
  inactiveDaysThreshold: 60,
  mentoriaPricing: DEFAULT_MENTORIA_PRICING,
  diasAteReativar: 45,
  recontatoIntervaloDias: 10,
  recontatoAutomatico: true,
  tarefaConfirmacaoAtiva: true,
  diasAntesConfirmacao: 2,
  tarefaPosLocacaoAtiva: true,
  diasPosLocacao: 1,
  tarefaTaxaAtiva: true,
  diasCobrancaTaxa: 3,
  despesasFixas: [],
  preferencias: DEFAULT_PREFERENCIAS,
};

/**
 * Busca a linha única de `settings` no Supabase (server-side) e mapeia
 * pro shape usado pelas telas de locação/configurações. Se a tabela
 * ainda não existir (migration do Bloco 1 não rodada) ou a query
 * falhar por qualquer motivo, cai em DEFAULT_SETTINGS — os mesmos
 * valores que já estavam fixos no código antes desse bloco, então
 * nunca quebra uma tela por causa disso.
 */
export async function fetchSettings(supabase: SupabaseClient): Promise<AppSettings> {
  const colunas =
    "flat_package_limit, flat_package_value, tier2_limit, tier2_rate, tier3_rate, reservation_fee, inactive_days_threshold, mentoria_valor_avista, mentoria_valor_parcelado, dias_ate_reativar, recontato_intervalo_dias, recontato_automatico, tarefa_confirmacao_ativa, dias_antes_confirmacao, tarefa_pos_locacao_ativa, dias_pos_locacao, tarefa_taxa_ativa, dias_cobranca_taxa, despesas_fixas";
  // A coluna `preferencias` veio depois (2026-10-24). Se ainda não existir no
  // banco, tenta de novo sem ela: o app segue com os padrões de sempre.
  let { data, error } = await supabase.from("settings").select(`${colunas}, preferencias`).eq("id", true).single();
  if (error || !data) {
    const retry = await supabase.from("settings").select(colunas).eq("id", true).single();
    data = retry.data as typeof data;
    error = retry.error;
  }

  if (error || !data) {
    return DEFAULT_SETTINGS;
  }

  return {
    pricing: {
      flatPackageLimit: data.flat_package_limit,
      flatPackageValue: Number(data.flat_package_value),
      tier2Limit: data.tier2_limit,
      tier2Rate: Number(data.tier2_rate),
      tier3Rate: Number(data.tier3_rate),
      minimumShots: null,
    },
    reservationFee: Number(data.reservation_fee),
    inactiveDaysThreshold: data.inactive_days_threshold,
    mentoriaPricing: {
      valorAvista: Number(data.mentoria_valor_avista),
      valorParcelado: Number(data.mentoria_valor_parcelado),
    },
    diasAteReativar: data.dias_ate_reativar ?? 45,
    recontatoIntervaloDias: data.recontato_intervalo_dias ?? 10,
    recontatoAutomatico: data.recontato_automatico ?? true,
    tarefaConfirmacaoAtiva: data.tarefa_confirmacao_ativa ?? true,
    diasAntesConfirmacao: data.dias_antes_confirmacao ?? 2,
    tarefaPosLocacaoAtiva: data.tarefa_pos_locacao_ativa ?? true,
    diasPosLocacao: data.dias_pos_locacao ?? 1,
    tarefaTaxaAtiva: data.tarefa_taxa_ativa ?? true,
    diasCobrancaTaxa: data.dias_cobranca_taxa ?? 3,
    despesasFixas: lerDespesasFixas(data.despesas_fixas),
    preferencias: lerPreferencias((data as { preferencias?: unknown }).preferencias),
  };
}

/** Só as preferências (leitura leve para telas e componentes que não precisam do resto). */
export async function fetchPreferencias(supabase: SupabaseClient): Promise<Preferencias> {
  const { data, error } = await supabase.from("settings").select("preferencias").eq("id", true).single();
  if (error || !data) return DEFAULT_PREFERENCIAS;
  return lerPreferencias((data as { preferencias?: unknown }).preferencias);
}

/**
 * Grava um grupo de preferências (ex.: "metas"), mantendo os outros grupos como
 * estão no banco. Valida tudo por lerPreferencias antes de gravar.
 */
export async function salvarPreferencias(
  supabase: SupabaseClient,
  mudanca: Partial<Preferencias>
): Promise<{ erro: string | null; preferencias: Preferencias }> {
  const { data, error } = await supabase.from("settings").select("preferencias").eq("id", true).single();
  if (error || !data) {
    return { erro: "Não consegui ler as configurações atuais. Confira a internet e tente de novo.", preferencias: DEFAULT_PREFERENCIAS };
  }
  const atual = lerPreferencias((data as { preferencias?: unknown }).preferencias);
  const novas = lerPreferencias({ ...atual, ...mudanca });
  const { error: erroGravar } = await supabase
    .from("settings")
    .update({ preferencias: diferencasDoPadrao(novas) })
    .eq("id", true);
  if (erroGravar) return { erro: erroGravar.message || "Não consegui salvar.", preferencias: atual };
  return { erro: null, preferencias: novas };
}
