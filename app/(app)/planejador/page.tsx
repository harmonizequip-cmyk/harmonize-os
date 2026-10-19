import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { carregarClientes, nomeProfissional, um } from "./carregar";
import PlanejadorLista, { type LinhaLista } from "./PlanejadorLista";

export default async function PlanejadorPage(props: { searchParams: Promise<{ cliente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const [{ data, error }, clientes] = await Promise.all([
    supabase
      .from("planejamentos")
      .select("id, client_id, calendar_event_id, paciente, data, data_retorno, procedimento, saldo_total, total_disparos, updated_at, sessoes_total:estado->>sessoesTotal, sessao_atual:estado->>sessaoAtual, clients(name, display_name, treatment), autor:profiles!planejamentos_created_by_fkey(cliente_id)")
      .order("data", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000),
    carregarClientes(supabase),
  ]);
  const lista: LinhaLista[] = (data ?? []).map((p: any) => ({
    ...p,
    clients: undefined,
    autor: undefined,
    cliente_nome: nomeProfissional(um(p.clients)),
    pela_cliente: !!um<any>(p.autor)?.cliente_id,
    sessoes_total: Number(p.sessoes_total) || undefined,
    sessao_atual: Number(p.sessao_atual) || undefined,
  }));
  return (
    <PlanejadorLista
      planejamentos={lista}
      clientes={clientes.map(({ id, name, city, whatsapp }) => ({ id, name, city, whatsapp }))}
      clienteInicial={searchParams.cliente ?? ""}
      hoje={hojeLocal()}
      erro={error ? "Não consegui carregar os planejamentos." : null}
    />
  );
}
