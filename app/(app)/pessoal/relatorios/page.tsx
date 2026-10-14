import { createClient } from "@/lib/supabase/server";
import { resolverPeriodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import RelatorioFinanceiro from "@/components/RelatorioFinanceiro";
import { carregarFinanceiro } from "@/lib/carregar-relatorio-financeiro";

// Relatórios do espaço Pessoal: para onde foi o dinheiro, de onde entrou,
// mês a mês e cartões pessoais.
export default async function RelatoriosPessoaisPage(
  props: {
    searchParams: Promise<{ period?: string; from?: string; to?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const supabase = createClient();
  const periodo = resolverPeriodo(searchParams.period ?? "mes", searchParams.from, searchParams.to);
  const fin = await carregarFinanceiro(supabase, "pessoal", periodo);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-neutral-900">Relatórios pessoais</h1>
      <FiltroBarra periodoPadrao="mes" rotuloPeriodo={periodo.rotulo} />
      <RelatorioFinanceiro escopo="pessoal" rotuloPeriodo={periodo.rotulo} {...fin} />
    </div>
  );
}
