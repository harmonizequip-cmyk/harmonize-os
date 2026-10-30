import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { fetchSettings } from "@/lib/settings";
import { etapaDoCliente } from "@/lib/funil-clientes";
import { taxaVencida } from "@/lib/taxa";
import FunilClient from "./FunilClient";

function falhou(oque: string, erro: { message: string } | null) {
  if (erro) throw new Error(`Não consegui carregar ${oque} do Funil: ${erro.message}`);
}

export default async function FunilPage() {
  const supabase = createClient();

  const { data: clients, error: erroClients } = await supabase
    .from("clients")
    .select(
      "id, name, city, address, whatsapp, stage, is_client, data_evento, origem, indicado_por, notes, parceiro, isento_taxa, treatment, display_name, client_tags(tags(id, name, color))"
    )
    .order("created_at", { ascending: true }); // sem tarefa nem data, o mais antigo primeiro
  // Funil vazio por erro pareceria "sem leads": melhor a tela de erro.
  falhou("os leads", erroClients);

  const { data: allTags, error: erroTags } = await supabase.from("tags").select("id, name, color").order("name");
  falhou("as tags", erroTags);

  // Rotina automática de recontato (clientes sem reserva): gera a tarefa
  // pendente de cada um antes de listar as tarefas. Se falhar, a tela
  // continua funcionando com o que já existe.
  await supabase.rpc("gerar_tarefas_recontato");
  // Tarefas da agenda: confirmação, pós-locação e cobrança da taxa.
  await supabase.rpc("gerar_tarefas_agenda");

  const { data: tasks, error: erroTasks } = await supabase
    .from("tasks")
    .select("id, client_id, type, follow_up_number, title, due_date, clients(name)")
    .eq("status", "pendente")
    .order("due_date", { ascending: true });
  falhou("as tarefas", erroTasks);

  const initialTasks = (tasks ?? []).map((t: any) => ({
    id: t.id,
    client_id: t.client_id,
    // Tarefa manual pode não ter cliente vinculado (tarefa solta) — nesse
    // caso o join com "clients" volta vazio, e client_name fica null em
    // vez de string vazia, pra dar pra distinguir "sem cliente" de fato.
    client_name: Array.isArray(t.clients) ? t.clients[0]?.name ?? null : t.clients?.name ?? null,
    type: t.type,
    follow_up_number: t.follow_up_number,
    title: t.title,
    due_date: t.due_date,
  }));

  // Data de hoje no calendário de Brasília. Com o toISOString() que estava
  // aqui antes, às 21h o "próximo evento" do card já pulava o dia seguinte.
  const todayStr = hojeLocal();
  const { data: upcomingEvents, error: erroEventos } = await supabase
    .from("calendar_events")
    .select("id, client_id, date_start, confirmed, confirmation_message_sent_at, equipment_id, taxa_status, is_mentoria, created_at")
    .neq("status", "cancelada")
    // Compromisso pessoal ("Outro") não é atendimento da cliente.
    .neq("event_type", "outros")
    .not("client_id", "is", null)
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true });
  falhou("os agendamentos", erroEventos);

  // id e confirmation_message_sent_at entraram junto com a leva F, para o
  // Funil poder usar exatamente o mesmo fluxo de "pedir confirmação no
  // WhatsApp" / "confirmar reserva" da Agenda (ver FunilClient.tsx),
  // sempre pelo id exato da reserva.
  const nextEventByClient = new Map<
    string,
    { id: string; date_start: string; confirmed: boolean; confirmation_message_sent_at: string | null }
  >();
  for (const e of upcomingEvents ?? []) {
    if (!nextEventByClient.has(e.client_id)) {
      nextEventByClient.set(e.client_id, {
        id: e.id,
        date_start: e.date_start,
        confirmed: e.confirmed,
        confirmation_message_sent_at: e.confirmation_message_sent_at ?? null,
      });
    }
  }

  // A taxa não mora mais no cliente, e sim em cada agendamento: quem
  // reserva cinco datas deve cinco taxas. A view clientes_taxas é quem
  // resume isso, para esta tela e as outras lerem a mesma conta.
  const { data: taxas, error: erroTaxas } = await supabase
    .from("clientes_taxas")
    .select("client_id, taxas_pendentes, taxas_pagas, valor_pendente, proxima_pendente");
  falhou("as taxas de reserva", erroTaxas);

  const taxaPorCliente = new Map<string, any>();
  for (const t of taxas ?? []) taxaPorCliente.set(t.client_id, t);

  // Etapa do funil de clientes (Reativar / Pré-reserva / Agendamento /
  // Cliente): calculada aqui, não gravada. Só conta reserva de equipamento
  // que não seja mentoria, igual à regra da taxa de reserva.
  const settings = await fetchSettings(supabase);
  const { data: ultimas, error: erroUltimas } = await supabase.from("clientes_ultima_locacao").select("client_id, ultima_locacao");
  falhou("as últimas locações", erroUltimas);
  const ultimaPorCliente = new Map<string, string>();
  for (const u of ultimas ?? []) ultimaPorCliente.set(u.client_id, u.ultima_locacao);

  const reservasPorCliente = new Map<string, { taxa_status: string }[]>();
  for (const e of upcomingEvents ?? []) {
    if (!e.equipment_id || e.is_mentoria) continue;
    const lista = reservasPorCliente.get(e.client_id) ?? [];
    lista.push({ taxa_status: e.taxa_status });
    reservasPorCliente.set(e.client_id, lista);
  }

  // Reservas com a taxa vencida por cliente (pendente além do prazo de
  // cobrança), só para o aviso no card.
  const vencidasPorCliente = new Map<string, number>();
  for (const e of upcomingEvents ?? []) {
    if (!e.equipment_id || e.is_mentoria || e.taxa_status !== "pendente") continue;
    if (!taxaVencida(e.created_at, todayStr, settings.diasCobrancaTaxa)) continue;
    vencidasPorCliente.set(e.client_id, (vencidasPorCliente.get(e.client_id) ?? 0) + 1);
  }

  const clientsWithEvents = (clients ?? []).map((c: any) => {
    const t = taxaPorCliente.get(c.id);
    const ultimaLocacao = ultimaPorCliente.get(c.id) ?? null;
    return {
      ...c,
      ultimaLocacao,
      clientStage: c.is_client
        ? etapaDoCliente({
            reservas: reservasPorCliente.get(c.id) ?? [],
            ultimaLocacao,
            hoje: todayStr,
            diasAteReativar: settings.diasAteReativar,
          })
        : null,
      tags: (c.client_tags ?? []).map((ct: any) => ct.tags).filter(Boolean),
      nextEvent: nextEventByClient.get(c.id) ?? null,
      taxasVencidas: vencidasPorCliente.get(c.id) ?? 0,
      taxasPendentes: Number(t?.taxas_pendentes ?? 0),
      taxasPagas: Number(t?.taxas_pagas ?? 0),
      valorPendente: Number(t?.valor_pendente ?? 0),
    };
  });

  return <FunilClient initialClients={clientsWithEvents} allTags={allTags ?? []} initialTasks={initialTasks} />;
}
