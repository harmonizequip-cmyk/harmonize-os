import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";

export default async function PortalPlanejamentoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = createClient();
  const { data: plano } = await supabase.from("planejamentos").select("id, client_id, calendar_event_id, estado").eq("id", id).maybeSingle();
  if (!plano) notFound();
  return (
    <EditorPlanejamento
      portal
      key={plano.id}
      planoId={plano.id}
      estado={plano.estado ?? {}}
      clienteId={plano.client_id}
      eventoId={plano.calendar_event_id}
      clientes={[]}
    />
  );
}
