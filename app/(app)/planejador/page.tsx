import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { carregarClientes, carregarListaPlanejador } from "./carregar";
import PlanejadorLista from "./PlanejadorLista";

export default async function PlanejadorPage(props: { searchParams: Promise<{ cliente?: string; paciente?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const [carga, clientes] = await Promise.all([carregarListaPlanejador(supabase), carregarClientes(supabase)]);
  return (
    <PlanejadorLista
      planejamentos={carga.lista}
      pacientes={carga.pacientes}
      temCadastro={carga.temCadastro}
      clientes={clientes.map(({ id, name, city, whatsapp }) => ({ id, name, city, whatsapp }))}
      clienteInicial={searchParams.cliente ?? ""}
      pacienteInicial={searchParams.paciente ?? ""}
      hoje={hojeLocal()}
      erro={carga.erro}
    />
  );
}
