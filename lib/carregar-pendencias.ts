// Contagem do sino e dados da tela de Avisos: reaproveita carregarDashboard
// (mesma conta do "Precisa de você") e lê as notificações não lidas.
// Só para quem abre o Dashboard (perfil ativo com a permissão).

import { createClient } from "@/lib/supabase/server";
import { destinoDoLogin } from "@/lib/acesso";
import { carregarDashboard } from "@/app/(app)/dashboard/dados";
import type { AvisoDash } from "@/components/dashboard/PrecisaDeVoce";

export async function podeVerAvisos(): Promise<boolean> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil, error } = await supabase
    .from("profiles")
    .select("is_admin, active, somente_leitura, cliente_id, permissions")
    .eq("id", user.id)
    .maybeSingle();
  if (destinoDoLogin(perfil, !!error) !== "harmonize") return false;
  return perfil?.is_admin === true || (perfil?.permissions as Record<string, unknown> | null)?.dashboard === true;
}

export async function carregarAvisosAbertos(): Promise<{ avisos: AvisoDash[]; naoLidas: number }> {
  const supabase = createClient();
  const [{ avisosMostrados }, { count }] = await Promise.all([
    carregarDashboard({}),
    // Sem o SQL do histórico, a tabela não existe: conta zero.
    supabase.from("notificacoes").select("id", { count: "exact", head: true }).is("lida_em", null),
  ]);
  return { avisos: avisosMostrados, naoLidas: count ?? 0 };
}
