import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarClientes } from "../carregar";
import EditorPlanejamento from "../EditorPlanejamento";

export default async function PlanejamentoPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const supabase = createClient();
  const [{ data: plano }, clientes] = await Promise.all([
    supabase.from("planejamentos").select("id, client_id, calendar_event_id, estado").eq("id", id).maybeSingle(),
    carregarClientes(supabase),
  ]);
  if (!plano) notFound();
  return (
    <EditorPlanejamento
      key={plano.id}
      planoId={plano.id}
      estado={plano.estado ?? {}}
      clienteId={plano.client_id}
      eventoId={plano.calendar_event_id}
      clientes={clientes}
    />
  );
}
