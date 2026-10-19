import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import PlanejadorLista, { type LinhaLista } from "../../(app)/planejador/PlanejadorLista";
import { clienteDoPortal } from "./carregar";

// A política planejamentos_select_cliente só devolve os planejamentos dela.
export default async function PortalPage() {
  const supabase = createClient();
  const [{ data, error }, cliente] = await Promise.all([
    supabase
      .from("planejamentos")
      .select("id, client_id, calendar_event_id, paciente, data, data_retorno, procedimento, saldo_total, total_disparos, updated_at, sessoes_total:estado->>sessoesTotal, sessao_atual:estado->>sessaoAtual")
      .order("data", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000),
    clienteDoPortal(supabase),
  ]);
  const lista: LinhaLista[] = (data ?? []).map((p: any) => ({
    ...p,
    cliente_nome: null,
    sessoes_total: Number(p.sessoes_total) || undefined,
    sessao_atual: Number(p.sessao_atual) || undefined,
  }));
  return (
    <PlanejadorLista
      portal
      nomeCliente={cliente?.profissional ?? null}
      planejamentos={lista}
      clientes={[]}
      clienteInicial=""
      hoje={hojeLocal()}
      erro={error ? "Não consegui carregar os planejamentos." : null}
    />
  );
}
