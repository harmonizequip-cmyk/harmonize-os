import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { buscarTodas } from "@/lib/buscar-todas";
import { separarAcessos, textoComoConheceu, type ClienteBase, type ConvitePreenchido, type PerfilCliente } from "@/lib/acessos-planejador";
import AcessosClient from "./AcessosClient";

// Acessos ao Planejador: quem tem acesso, quem está sem (pausado, vencido ou
// esperando liberar) e quem não tem cadastro. ?acao=formulario (atalho do "+")
// abre já em "Sem cadastro" com o link do formulário à mão.
export const dynamic = "force-dynamic";

interface ClienteBanco {
  id: string;
  name: string;
  display_name: string | null;
  clinic_name: string | null;
  whatsapp: string | null;
  city: string | null;
  is_client: boolean | null;
  treatment: string | null;
  portal_fotos?: boolean | null;
}

// Com a coluna das fotos; sem o SQL das fotos no portal, carrega sem ela.
async function carregarClientes(supabase: ReturnType<typeof createClient>): Promise<ClienteBanco[]> {
  const ler = (colunas: string) =>
    buscarTodas<ClienteBanco>((de, ate) =>
      supabase.from("clients").select(colunas).eq("is_test", false).neq("stage", "desqualificado").order("id").range(de, ate) as unknown as PromiseLike<{ data: ClienteBanco[] | null; error: { message: string } | null }>
    );
  const base = "id, name, display_name, clinic_name, whatsapp, city, is_client, treatment";
  try {
    return await ler(`${base}, portal_fotos`);
  } catch (e) {
    if (!/portal_fotos/.test((e as Error).message)) throw e;
    return ler(base);
  }
}

export default async function AcessosPage(props: { searchParams: Promise<{ acao?: string }> }) {
  const sp = await props.searchParams;
  const supabase = createClient();
  let erro: string | null = null;
  try {
    const [clientes, perfisR, convitesR] = await Promise.all([
      carregarClientes(supabase),
      supabase.from("profiles").select("id, email, active, cliente_id").not("cliente_id", "is", null),
      supabase.from("convites_cadastro").select("client_id, resultado_client_id, email_login, preenchido_em, dados").not("preenchido_em", "is", null),
    ]);
    if (perfisR.error) throw new Error(perfisR.error.message);
    if (convitesR.error) throw new Error(convitesR.error.message);
    const perfis = (perfisR.data ?? []) as PerfilCliente[];
    const ids = [...new Set(perfis.map((p) => p.cliente_id))];
    const validadesLista = await Promise.all(
      ids.map(async (id) => {
        const { data } = await supabase.rpc("portal_validade_cliente", { p_client_id: id });
        return [id, ((data as { valido_ate?: string | null } | null)?.valido_ate ?? null) as string | null] as const;
      })
    );
    const convites: ConvitePreenchido[] = ((convitesR.data ?? []) as { client_id: string | null; resultado_client_id: string | null; email_login: string | null; preenchido_em: string; dados: Record<string, unknown> | null }[])
      .map((c) => ({
        client_id: (c.resultado_client_id ?? c.client_id) as string,
        email_login: c.email_login,
        preenchido_em: c.preenchido_em,
        comoConheceu: textoComoConheceu(c.dados),
      }))
      .filter((c) => !!c.client_id);
    const base: (ClienteBase & { tratamento: string | null; nomeExibicao: string | null; nomeCompleto: string })[] = clientes.map((c) => ({
      id: c.id,
      nome: c.clinic_name ? `${c.name} · ${c.clinic_name}` : c.name,
      nomeCompleto: c.name,
      whatsapp: c.whatsapp,
      cidade: c.city,
      ehCliente: !!c.is_client,
      tratamento: c.treatment,
      nomeExibicao: c.display_name,
      fotos: c.portal_fotos ?? null,
    }));
    const grupos = separarAcessos(base, perfis, Object.fromEntries(validadesLista), convites, hojeLocal());
    return <AcessosClient grupos={grupos} abrirFormulario={sp.acao === "formulario"} erro={null} />;
  } catch (e) {
    erro = (e as Error).message;
  }
  return <AcessosClient grupos={{ comAcesso: [], semAcesso: [], semCadastro: [] }} abrirFormulario={false} erro={erro} />;
}
