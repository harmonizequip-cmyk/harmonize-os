import { createClient } from "@/lib/supabase/server";
import { estadoInicial } from "@/lib/planejamento";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";
import { clienteDoPortal } from "../carregar";

export default async function PortalNovoPage() {
  const supabase = createClient();
  const cliente = await clienteDoPortal(supabase);
  return (
    <EditorPlanejamento
      portal
      planoId={null}
      estado={estadoInicial(cliente?.profissional ?? null)}
      clienteId={cliente?.client_id ?? null}
      eventoId={null}
      clientes={[]}
    />
  );
}
