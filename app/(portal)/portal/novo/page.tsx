import { createClient } from "@/lib/supabase/server";
import { estadoInicial } from "@/lib/planejamento";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";
import { carregarPaciente } from "../../../(app)/planejador/carregar";
import { clienteDoPortal } from "../carregar";

export default async function PortalNovoPage(props: { searchParams: Promise<{ paciente?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();
  const [cliente, paciente] = await Promise.all([clienteDoPortal(supabase), carregarPaciente(supabase, sp.paciente)]);
  const estado = estadoInicial(cliente?.profissional ?? null);
  if (paciente) Object.assign(estado, { paciente: paciente.nome, pacienteId: paciente.id });
  return <EditorPlanejamento portal planoId={null} estado={estado} clienteId={cliente?.client_id ?? null} eventoId={null} clientes={[]} />;
}
