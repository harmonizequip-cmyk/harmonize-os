import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import ConfiguracoesHub from "./ConfiguracoesHub";
import { ehSecao } from "./secoes-ids";

// Central de Configurações: check-up e assuntos em grupos. ?secao=<id> abre um
// assunto; ?acao=backup (aviso de domingo) abre o Backup com o arquivo pronto.
export default async function ConfiguracoesPage(props: { searchParams: Promise<{ secao?: string; acao?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();

  const [settings, { data: tags }, { data: teste }, { data: auth }, { count: acessos }] = await Promise.all([
    fetchSettings(supabase),
    supabase.from("tags").select("id, name, color, is_automatic").order("name"),
    supabase.from("settings").select("test_mode").eq("id", true).single(),
    supabase.auth.getUser(),
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("somente_leitura", true).eq("active", true),
  ]);

  const user = auth.user;
  const { data: perfil } = user
    ? await supabase.from("profiles").select("name, somente_leitura").eq("id", user.id).single()
    : { data: null };
  // Acesso só de visualização vê tudo menos Configurações (o menu já esconde;
  // aqui fecha também quem digita o endereço).
  if (perfil?.somente_leitura) redirect("/dashboard");

  const secao = sp.acao === "backup" ? "backup" : ehSecao(sp.secao) ? sp.secao : null;

  return (
    <ConfiguracoesHub
      secao={secao}
      dados={{
        settings,
        tags: tags ?? [],
        testMode: !!teste?.test_mode,
        nome: perfil?.name ?? "",
        email: user?.email ?? "",
        acessosVisualizacao: acessos ?? 0,
      }}
    />
  );
}
