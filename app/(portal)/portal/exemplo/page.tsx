import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { estadoDeExemplo } from "@/lib/tour-planejador";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";
import { redirect } from "next/navigation";
import { clienteDoPortal } from "../carregar";
import { carregarRecursosLiberados } from "@/lib/carregar-recursos";
import { estaLiberado } from "@/lib/recursos";

// Tour do Planejador: paciente de exemplo que nunca vai ao banco (EditorPlanejamento com `demo`).
// Só abre para a cliente depois que o dono libera (Configurações > Recursos em teste).
export default async function PortalExemploPage() {
  const supabase = createClient();
  const [cliente, liberados] = await Promise.all([clienteDoPortal(supabase), carregarRecursosLiberados(supabase)]);
  if (!estaLiberado(liberados, "tour-planejador")) redirect("/portal");
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
