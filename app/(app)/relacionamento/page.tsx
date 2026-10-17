import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { carregarRelacionamento } from "@/lib/carregar-relacionamento";
import RelacionamentoClient from "./RelacionamentoClient";

// Relacionamento: quem chamar hoje (no máximo 8 por dia, por prioridade) e a
// carteira de clientes e leads classificada sozinha. Regras em
// lib/relacionamento.ts; dados em lib/carregar-relacionamento.ts.
export const dynamic = "force-dynamic";

export default async function RelacionamentoPage(props: { searchParams: Promise<{ aba?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();
  const hoje = hojeLocal();
  const pessoas = await carregarRelacionamento(supabase, hoje);
  const aba = sp.aba === "clientes" || sp.aba === "leads" ? sp.aba : "hoje";
  return <RelacionamentoClient pessoas={pessoas} hoje={hoje} abaInicial={aba} />;
}
