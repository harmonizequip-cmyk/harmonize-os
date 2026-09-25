import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import FunilClient from "./FunilClient";

export default async function FunilPage() {
  const supabase = createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select(
      "id, name, city, address, whatsapp, stage, is_client, data_evento, origem, notes, parceiro, treatment, display_name, client_tags(tags(id, name, color))"
    )
    .order("created_at", { ascending: false });

  const { data: allTags } = await supabase.from("tags").select("id, name, color").order("name");

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, client_id, type, follow_up_number, title, due_date, clients(name)")
    .eq("status", "pendente")
    .order("due_date", { ascending: true });

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
  const { data: upcomingEvents } = await supabase
    .from("calendar_events")
    .select("id, client_id, date_start, confirmed, confirmation_message_sent_at")
    .neq("status", "cancelada")
    .not("client_id", "is", null)
    .gte("date_start", todayStr)
    .order("date_start", { ascending: true });

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
  const { data: taxas } = await supabase
    .from("clientes_taxas")
    .select("client_id, taxas_pendentes, taxas_pagas, valor_pendente, proxima_pendente");

  const taxaPorCliente = new Map<string, any>();
  for (const t of taxas ?? []) taxaPorCliente.set(t.client_id, t);

  const clientsWithEvents = (clients ?? []).map((c: any) => {
    const t = taxaPorCliente.get(c.id);
    return {
      ...c,
      tags: (c.client_tags ?? []).map((ct: any) => ct.tags).filter(Boolean),
      nextEvent: nextEventByClient.get(c.id) ?? null,
      taxasPendentes: Number(t?.taxas_pendentes ?? 0),
      taxasPagas: Number(t?.taxas_pagas ?? 0),
      valorPendente: Number(t?.valor_pendente ?? 0),
    };
  });

  return <FunilClient initialClients={clientsWithEvents} allTags={allTags ?? []} initialTasks={initialTasks} />;
}
