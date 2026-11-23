import { createClient } from "@/lib/supabase/server";
import { estadoInicial } from "@/lib/planejamento";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";
import { carregarPaciente } from "../../../(app)/planejador/carregar";
import { clienteDoPortal } from "../carregar";
import { carregarRecursosLiberados } from "@/lib/carregar-recursos";
import { estaLiberado } from "@/lib/recursos";

export default async function PortalNovoPage(props: { searchParams: Promise<{ paciente?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();
  const [cliente, paciente, liberados] = await Promise.all([clienteDoPortal(supabase), carregarPaciente(supabase, sp.paciente), carregarRecursosLiberados(supabase)]);
  const estado = estadoInicial(cliente?.profissional ?? null);
  if (paciente) Object.assign(estado, { paciente: paciente.nome, pacienteId: paciente.id });
  return <EditorPlanejamento portal dicasPortal={estaLiberado(liberados, "tour-planejador")} planoId={null} estado={estado} clienteId={cliente?.client_id ?? null} eventoId={null} clientes={[]} />;
}
