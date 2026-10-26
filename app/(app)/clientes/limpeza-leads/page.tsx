// TEMPORÁRIA: remover quando terminar a limpeza (rota, LimpezaLeadsClient.tsx,
// lib/limpeza-leads.ts e o link em /clientes). Ver "Pendências conhecidas" no CLAUDE.md.

import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buscarTodas } from "@/lib/buscar-todas";
import { tratamentoEPrimeiroNome } from "@/lib/saudacao";
import { dataLocalDe, type LeadLimpeza, type Vinculos } from "@/lib/limpeza-leads";
import LimpezaLeadsClient from "./LimpezaLeadsClient";

// Sempre do banco: a lista decide o que pode ser apagado, cache seria perigoso.
export const dynamic = "force-dynamic";

function Restrito({ texto }: { texto: string }) {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold text-neutral-900">Limpar leads</h1>
      <p className="text-sm text-neutral-600">{texto}</p>
      <Link href="/clientes" className="text-sm text-brand-blue underline underline-offset-2">
        Voltar para Clientes
      </Link>
    </div>
  );
}

type Linha = { client_id: string | null };

export default async function LimpezaLeadsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase.from("profiles").select("is_admin, active, somente_leitura").eq("id", user.id).single();
  // Guarda de tela; a de verdade é o require_admin dentro de delete_record_forever.
  if (!perfil?.is_admin || perfil.active === false) return <Restrito texto="Esta área é só para administradores." />;
  if (perfil.somente_leitura) return <Restrito texto="Acesso só de visualização: esta tela apaga dados e não abre aqui." />;

  let erro: string | null = null;
  let leads: LeadLimpeza[] = [];
  let deFora = 0;

  try {
    const porId = <T extends Linha>(tabela: string, colunas: string, filtro?: (q: any) => any) =>
      buscarTodas<T>((de, ate) => {
        let q: any = supabase.from(tabela).select(colunas).not("client_id", "is", null);
        if (filtro) q = filtro(q);
        return q.order("id").range(de, ate);
      });

    const [clientes, rentals, transactions, eventos, creditos, contratos, planejamentos, perfis, tarefas, anotacoes, envios] = await Promise.all([
      buscarTodas<Record<string, any>>((de, ate) =>
        supabase.from("clients").select("*").eq("is_client", false).eq("is_test", false).order("id").range(de, ate)
      ),
      porId<Linha>("rentals", "id, client_id"),
      porId<Linha>("transactions", "id, client_id"),
      porId<Linha>("calendar_events", "id, client_id"),
      porId<Linha>("creditos_cliente", "id, client_id"),
      porId<Linha>("contratos_emitidos", "id, client_id"),
      porId<Linha>("planejamentos", "id, client_id"),
      buscarTodas<{ cliente_id: string | null }>((de, ate) =>
        supabase.from("profiles").select("id, cliente_id").not("cliente_id", "is", null).order("id").range(de, ate)
      ),
      porId<Linha>("tasks", "id, client_id"),
      porId<Linha>("cliente_anotacoes", "id, client_id"),
      porId<Linha & { status: string }>("campanha_envios", "id, client_id, status"),
    ]);
    // Quem cada lead indicou (vem da própria lista de clientes, inclusive clientes).
    const indicados = await buscarTodas<{ indicado_por: string | null }>((de, ate) =>
      supabase.from("clients").select("id, indicado_por").not("indicado_por", "is", null).order("id").range(de, ate)
    );

    const conjunto = (linhas: Linha[]) => new Set(linhas.map((l) => l.client_id as string));
    const contar = (linhas: Linha[]) => {
      const m = new Map<string, number>();
      for (const l of linhas) m.set(l.client_id as string, (m.get(l.client_id as string) ?? 0) + 1);
      return m;
    };
    const comLocacao = conjunto(rentals);
    const comLancamento = conjunto(transactions);
    const comAgenda = conjunto(eventos);
    const comCredito = conjunto(creditos);
    const comContrato = conjunto(contratos);
    const comPlanejamento = conjunto(planejamentos);
    const comLogin = new Set(perfis.map((p) => p.cliente_id as string));
    const nTarefas = contar(tarefas);
    const nAnotacoes = contar(anotacoes);
    const nEnvios = contar(envios);
    const naoQuer = new Set(envios.filter((e) => e.status === "nao_quer").map((e) => e.client_id as string));
    const nIndicou = new Map<string, number>();
    for (const c of indicados) nIndicou.set(c.indicado_por as string, (nIndicou.get(c.indicado_por as string) ?? 0) + 1);

    for (const c of clientes) {
      const v: Vinculos = {
        locacao: comLocacao.has(c.id),
        lancamento: comLancamento.has(c.id),
        agenda: comAgenda.has(c.id),
        credito: comCredito.has(c.id),
        contrato: comContrato.has(c.id),
        login: comLogin.has(c.id),
        planejamento: comPlanejamento.has(c.id),
      };
      if (Object.values(v).some(Boolean)) {
        deFora++;
        continue;
      }
      const { tratamento, primeiroNome } = tratamentoEPrimeiroNome({ name: c.name, treatment: c.treatment, displayName: c.display_name });
      leads.push({
        id: c.id,
        nome: c.name ?? "(sem nome)",
        apelido: primeiroNome ? [tratamento, primeiroNome].filter(Boolean).join(" ") : null,
        cidade: c.city ?? null,
        whatsapp: c.whatsapp ?? null,
        etapa: c.stage ?? null,
        origem: c.origem ?? null,
        criadoEm: dataLocalDe(c.created_at),
        tarefas: nTarefas.get(c.id) ?? 0,
        anotacoes: nAnotacoes.get(c.id) ?? 0,
        envios: nEnvios.get(c.id) ?? 0,
        naoQuer: naoQuer.has(c.id),
        indicou: nIndicou.get(c.id) ?? 0,
        cadastro: c,
      });
    }
  } catch (e) {
    // Nunca tratar erro como lista vazia.
    erro = e instanceof Error ? e.message : "Não consegui carregar os leads.";
    leads = [];
  }

  return <LimpezaLeadsClient leads={leads} deFora={deFora} erro={erro} />;
}
