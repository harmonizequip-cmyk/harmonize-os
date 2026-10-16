import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import type { PlanejamentoLinha } from "@/lib/planejamento";
import { carregarClientes, nomeProfissional, um } from "./carregar";
import PlanejadorLista from "./PlanejadorLista";

export default async function PlanejadorPage(props: { searchParams: Promise<{ cliente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const [{ data, error }, clientes] = await Promise.all([
    supabase
      .from("planejamentos")
      .select("id, client_id, calendar_event_id, paciente, data, data_retorno, procedimento, saldo_total, total_disparos, updated_at, clients(name, display_name, treatment)")
      .order("data", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1000),
    carregarClientes(supabase),
  ]);
  const lista: PlanejamentoLinha[] = (data ?? []).map((p: any) => ({ ...p, clients: undefined, cliente_nome: nomeProfissional(um(p.clients)) }));
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
