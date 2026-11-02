import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/buscar-todas";
import type { DescontoIndicacao } from "@/lib/indicacao";
import IndicacoesClient, { type ClienteIndicacao } from "./IndicacoesClient";

// Programa de indicação: indicações para ligar (nome digitado no formulário que
// não bateu com um cadastro só), descontos de 10% e quem indicou quem.
export const dynamic = "force-dynamic";

export default async function IndicacoesPage() {
  const supabase = createClient();
  try {
    const clientes = await buscarTodas<ClienteIndicacao>((de, ate) =>
      supabase
        .from("clients")
        .select("id, name, display_name, city, whatsapp, indicado_por, indicacao_nome, is_test")
        .eq("is_test", false)
        .order("id")
        .range(de, ate) as unknown as PromiseLike<{ data: ClienteIndicacao[] | null; error: { message: string } | null }>
    );
    const { data: desc, error: eDesc } = await supabase
      .from("descontos_indicacao")
      .select("id, client_id, tipo, outro_client_id, percentual, valido_ate, usado_em, usado_rental_id, created_at")
      .order("created_at", { ascending: false });
    if (eDesc) throw new Error(eDesc.message);
    const indicadasIds = clientes.filter((c) => c.indicado_por).map((c) => c.id);
    const alugaram = new Set<string>();
    if (indicadasIds.length) {
      const { data: r } = await supabase.from("rentals_contabilizaveis").select("client_id").in("client_id", indicadasIds);
      for (const x of (r ?? []) as { client_id: string }[]) alugaram.add(x.client_id);
    }
    return <IndicacoesClient clientes={clientes} descontos={(desc ?? []) as DescontoIndicacao[]} alugaram={[...alugaram]} erro={null} />;
  } catch (e) {
    const msg = (e as Error).message;
    const faltaSql = /indicacao_nome|descontos_indicacao/.test(msg);
    return <IndicacoesClient clientes={[]} descontos={[]} alugaram={[]} erro={faltaSql ? "Falta rodar o SQL do programa de indicação." : msg} />;
  }
}
