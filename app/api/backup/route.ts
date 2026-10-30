import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";

// Backup manual: baixa um arquivo JSON com todas as tabelas do negócio.
// Só administrador ativo. A leitura passa pelo login de quem pede (RLS), então
// nada vem a mais do que a pessoa já enxerga. Não inclui chaves de acesso
// biométrico (webauthn_credentials), que não servem para restaurar dados.
export const dynamic = "force-dynamic";

const TABELAS = [
  "profiles",
  "settings",
  "equipments",
  "categories",
  "contas_pix",
  "cidades_coordenadas",
  "tags",
  "cartoes",
  "aplicadores",
  "aplicador_montagens",
  "bloqueios_equipamento",
  "clients",
  "client_tags",
  "calendar_events",
  "rentals",
  "rental_payments",
  "transactions",
  "emprestimos",
  "mentoring_events",
  "expense_limits",
  "tasks",
  "contratos_emitidos",
  "movimentacoes",
  "creditos_cliente",
  "locacao_contagens",
  "reserva_contagens",
  "pacientes",
  "planejamentos",
  "paciente_fotos",
  "convites_cadastro",
  "cadastros_recebidos",
  "agenda_envios",
  "orcamentos_pessoais",
  "insights",
  "assistente_memoria",
  "cliente_anotacoes",
  "campanhas",
  "campanha_envios",
];

// Tabelas que podem ainda não existir no banco (SQL das campanhas, dos pacientes ou das fotos não rodado):
// sem a tabela não há dado a perder, então o backup sai sem ela em vez de falhar.
const PODEM_FALTAR = new Set(["campanhas", "campanha_envios", "pacientes", "paciente_fotos"]);

function tabelaNaoExiste(error: { code?: string; message?: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message ?? "");
}

const PAGINA = 1000;

// Ordem estável para paginar. client_tags não tem coluna id (chave composta).
const ORDEM: Record<string, string[]> = { client_tags: ["client_id", "tag_id"] };

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase.from("profiles").select("is_admin, active").eq("id", user.id).single();
  if (!perfil?.is_admin || !perfil.active) return NextResponse.json({ erro: "Só administrador pode baixar o backup." }, { status: 403 });

  const tabelas: Record<string, unknown[]> = {};
  const contagens: Record<string, number> = {};

  for (const nome of TABELAS) {
    const linhas: unknown[] = [];
    let faltando = false;
    for (let de = 0; ; de += PAGINA) {
      let consulta = supabase.from(nome).select("*");
      for (const coluna of ORDEM[nome] ?? ["id"]) consulta = consulta.order(coluna, { ascending: true });
      const { data, error } = await consulta.range(de, de + PAGINA - 1);
      // Backup incompleto nunca pode parecer completo: se uma tabela falhar, o arquivo não sai.
      if (error && de === 0 && PODEM_FALTAR.has(nome) && tabelaNaoExiste(error)) {
        faltando = true;
        break;
      }
      if (error) {
        return NextResponse.json({ erro: `Falha ao ler a tabela ${nome}: ${error.message}` }, { status: 500 });
      }
      linhas.push(...(data ?? []));
      if (!data || data.length < PAGINA) break;
    }
    if (faltando) continue;
    tabelas[nome] = linhas;
    contagens[nome] = linhas.length;
  }

  const agora = new Date();
  const corpo = JSON.stringify(
    { gerado_em: agora.toISOString(), projeto: "harmonize-os", contagens, tabelas },
    null,
    1
  );
  const nome = `backup-harmonize-${hojeLocal(agora)}.json`;

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
