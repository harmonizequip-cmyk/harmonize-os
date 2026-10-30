import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import PlanejadorLista from "../../(app)/planejador/PlanejadorLista";
import { carregarListaPlanejador } from "../../(app)/planejador/carregar";
import { clienteDoPortal } from "./carregar";

// As políticas planejamentos_select_cliente e pacientes_select_cliente só devolvem os dela.
export default async function PortalPage(props: { searchParams: Promise<{ paciente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const [carga, cliente] = await Promise.all([carregarListaPlanejador(supabase, true), clienteDoPortal(supabase)]);
  return (
    <PlanejadorLista
      portal
      nomeCliente={cliente?.profissional ?? null}
      planejamentos={carga.lista}
      pacientes={carga.pacientes}
      temCadastro={carga.temCadastro}
      clientes={[]}
      clienteInicial=""
      pacienteInicial={searchParams.paciente ?? ""}
      hoje={hojeLocal()}
      erro={carga.erro}
    />
  );
}
