import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import EditorPlanejamento from "../../../(app)/planejador/EditorPlanejamento";
import { carregarRecursosLiberados } from "@/lib/carregar-recursos";
import { estaLiberado } from "@/lib/recursos";

export default async function PortalPlanejamentoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = createClient();
  const [{ data: plano }, liberados] = await Promise.all([
    supabase.from("planejamentos").select("id, client_id, calendar_event_id, estado, updated_at").eq("id", id).maybeSingle(),
    carregarRecursosLiberados(supabase),
  ]);
  if (!plano) notFound();
  return (
    <EditorPlanejamento
      portal
      dicasPortal={estaLiberado(liberados, "tour-planejador")}
      key={plano.id}
      planoId={plano.id}
      estado={plano.estado ?? {}}
      updatedAt={plano.updated_at ?? null}
      clienteId={plano.client_id}
      eventoId={plano.calendar_event_id}
      clientes={[]}
    />
  );
}
