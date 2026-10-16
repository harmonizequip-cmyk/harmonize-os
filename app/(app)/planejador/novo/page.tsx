import { createClient } from "@/lib/supabase/server";
import { estadoInicial } from "@/lib/planejamento";
import { carregarClientes, carregarContexto } from "../carregar";
import EditorPlanejamento from "../EditorPlanejamento";

// Planejamento novo: abre o planejador já com a profissional (cliente) e a
// data do atendimento. Só vira registro no banco quando ganha conteúdo.
export default async function NovoPlanejamentoPage(props: { searchParams: Promise<{ cliente?: string; evento?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();
  const [clientes, ctx] = await Promise.all([carregarClientes(supabase), carregarContexto(supabase, sp.cliente, sp.evento)]);
  const profissional = clientes.find((c) => c.id === ctx.clienteId)?.profissional ?? null;
  return (
    <EditorPlanejamento
      planoId={null}
      estado={estadoInicial(profissional, ctx.evento?.date_start)}
      clienteId={ctx.clienteId}
      eventoId={ctx.evento?.id ?? null}
      clientes={clientes}
    />
  );
}
