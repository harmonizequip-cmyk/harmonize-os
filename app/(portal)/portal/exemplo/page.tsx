import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { estadoDeExemplo } from "@/lib/tour-planejador";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";
import { clienteDoPortal } from "../carregar";

// Tour do Planejador: paciente de exemplo que nunca vai ao banco (EditorPlanejamento com `demo`).
export default async function PortalExemploPage() {
  const supabase = createClient();
  const cliente = await clienteDoPortal(supabase);
  return (
    <EditorPlanejamento
      portal
      demo
      planoId={null}
      estado={estadoDeExemplo(hojeLocal(), cliente?.profissional ?? null)}
      clienteId={cliente?.client_id ?? null}
      eventoId={null}
      clientes={[]}
    />
  );
}
