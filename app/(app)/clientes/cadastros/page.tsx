import { createClient } from "@/lib/supabase/server";
import CadastrosClient from "./CadastrosClient";

export default async function CadastrosRecebidosPage() {
  const supabase = createClient();
  const [{ data: pendentes }, { data: clientes }] = await Promise.all([
    supabase
      .from("cadastros_recebidos")
      .select("id, respondido_em, recebido_em, nome, profissao, whatsapp, email, empresa, estabelecimento, cidade_estado")
      .eq("status", "pendente")
      // Do mais antigo para o mais recente.
      .order("respondido_em", { ascending: true, nullsFirst: false })
      .limit(300),
    supabase
      .from("clients")
      .select("id, name, display_name, treatment, whatsapp, email, clinic_name, city, state, notes, is_client")
      .eq("is_test", false)
      .order("name"),
  ]);
  return <CadastrosClient pendentes={pendentes ?? []} clientes={clientes ?? []} />;
}
