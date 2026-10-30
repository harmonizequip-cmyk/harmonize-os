import { createClient } from "@/lib/supabase/server";
import { estadoInicial } from "@/lib/planejamento";
import { carregarClientes, carregarContexto, carregarPaciente } from "../carregar";
import EditorPlanejamento from "../EditorPlanejamento";

// Planejamento novo: abre o planejador já com a profissional (cliente), a
// data do atendimento e, vindo da ficha do paciente (?paciente=), o paciente.
// Só vira registro no banco quando ganha conteúdo.
export default async function NovoPlanejamentoPage(props: { searchParams: Promise<{ cliente?: string; evento?: string; paciente?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();
  const [clientes, ctx, paciente] = await Promise.all([
    carregarClientes(supabase),
    carregarContexto(supabase, sp.cliente, sp.evento),
    carregarPaciente(supabase, sp.paciente),
  ]);
  const clienteId = ctx.clienteId ?? paciente?.client_id ?? null;
  const profissional = clientes.find((c) => c.id === clienteId)?.profissional ?? null;
  const estado = estadoInicial(profissional, ctx.evento?.date_start);
  if (paciente && paciente.client_id === clienteId) Object.assign(estado, { paciente: paciente.nome, pacienteId: paciente.id });
  return <EditorPlanejamento planoId={null} estado={estado} clienteId={clienteId} eventoId={ctx.evento?.id ?? null} clientes={clientes} />;
}
