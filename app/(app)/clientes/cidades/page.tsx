import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/buscar-todas";
import { buscarCidades } from "@/lib/carregar-cidades";
import { hojeLocal } from "@/lib/period";
import type { CidadeConhecida } from "@/lib/cidades-cliente";
import CompletarCidadesClient, { type SemCidade } from "./CompletarCidadesClient";

// Completar cidades (pedido do dono, 10/11/2026): clientes e leads sem cidade no
// cadastro, um embaixo do outro, para apontar a cidade com poucos toques. Quem
// tem reserva marcada vem primeiro, depois clientes, depois leads mais novos.
export const dynamic = "force-dynamic";

export default async function CompletarCidadesPage(props: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await props.searchParams;
  const supabase = createClient();
  try {
    const [semCidade, reservas, cidadesTabela, cidadesClientes] = await Promise.all([
      buscarTodas<any>((de, ate) =>
        supabase
          .from("clients")
          .select("id, name, display_name, treatment, whatsapp, is_client, stage, created_at, city")
          .eq("is_test", false)
          .neq("stage", "desqualificado")
          .or("city.is.null,city.eq.")
          .order("id")
          .range(de, ate)
      ),
      supabase.from("calendar_events").select("client_id").gte("date_start", hojeLocal()).neq("status", "cancelada").not("client_id", "is", null),
      buscarCidades(supabase).catch(() => null),
      buscarTodas<any>((de, ate) => supabase.from("clients").select("city, state").not("city", "is", null).order("id").range(de, ate)),
    ]);
    const comReserva = new Set(((reservas.data ?? []) as { client_id: string }[]).map((r) => r.client_id));
    const lista: SemCidade[] = semCidade
      .filter((c) => !(c.city ?? "").trim())
      .map((c) => ({
        id: c.id,
        nome: c.display_name || c.name,
        nomeCompleto: c.name,
        whatsapp: c.whatsapp,
        ehCliente: !!c.is_client,
        temReserva: comReserva.has(c.id),
        criadoEm: c.created_at,
      }))
      .sort(
        (a, b) =>
          Number(b.id === cliente) - Number(a.id === cliente) ||
          Number(b.temReserva) - Number(a.temReserva) ||
          Number(b.ehCliente) - Number(a.ehCliente) ||
          String(b.criadoEm).localeCompare(String(a.criadoEm))
      );
    const conhecidas: CidadeConhecida[] = [
      ...(cidadesTabela ?? []).map((c) => ({ nome: c.nome_exibicao || c.nome, uf: c.uf })),
      ...cidadesClientes.filter((c: any) => (c.city ?? "").trim()).map((c: any) => ({ nome: String(c.city).trim(), uf: c.state ?? null })),
    ];
    return <CompletarCidadesClient pessoas={lista} conhecidas={conhecidas} erro={null} />;
  } catch (e) {
    return <CompletarCidadesClient pessoas={[]} conhecidas={[]} erro={(e as Error).message} />;
  }
}
