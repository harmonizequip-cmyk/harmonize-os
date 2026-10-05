import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import TarefasClient from "./TarefasClient";

function mapTask(t: any, eventos: Map<string, { date_start: string; taxa_status: string | null }> = new Map()) {
  const c = Array.isArray(t.clients) ? t.clients[0] : t.clients;
  const ev = t.event_id ? eventos.get(t.event_id) : undefined;
  return {
    id: t.id,
    client_id: t.client_id,
    client_name: c?.name ?? null,
    client_whatsapp: c?.whatsapp ?? null,
    client_treatment: c?.treatment ?? null,
    client_display_name: c?.display_name ?? null,
    event_id: t.event_id ?? null,
    event_date: ev?.date_start ?? null,
    event_taxa_status: ev?.taxa_status ?? null,
    type: t.type,
    follow_up_number: t.follow_up_number,
    title: t.title,
    due_date: t.due_date,
    completed_at: t.completed_at,
  };
}

export default async function TarefasPage() {
  const supabase = createClient();

  // Mesma rotina do Funil: garante o recontato pendente de cada cliente
  // sem reserva antes de listar.
  await supabase.rpc("gerar_tarefas_recontato");
  // Tarefas da agenda: confirmação, pós-locação e cobrança da taxa.
  await supabase.rpc("gerar_tarefas_agenda");

  const [{ data: pendentes }, { data: concluidas }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, client_id, type, follow_up_number, title, due_date, completed_at, event_id, clients(name, whatsapp, treatment, display_name)")
      .eq("status", "pendente")
      .order("due_date", { ascending: true }),
    // Só as 50 mais recentes — sem limite, essa lista só cresceria pra
    // sempre e deixaria a tela cada vez mais pesada de carregar.
    supabase
      .from("tasks")
      .select("id, client_id, type, follow_up_number, title, due_date, completed_at, clients(name)")
      .eq("status", "concluida")
      .order("completed_at", { ascending: false })
      .limit(50),
  ]);

  // Data e situação da taxa da reserva de cada tarefa que veio de uma
  // reserva (cobrança de taxa, confirmação, pós-locação), para a tarefa
  // oferecer a ação certa sem abrir outra tela.
  const idsEventos = Array.from(new Set((pendentes ?? []).map((t: any) => t.event_id).filter(Boolean))) as string[];
  const eventos = new Map<string, { date_start: string; taxa_status: string | null }>();
  if (idsEventos.length > 0) {
    const { data: evs } = await supabase.from("calendar_events").select("id, date_start, taxa_status").in("id", idsEventos);
    for (const e of evs ?? []) eventos.set((e as any).id, { date_start: (e as any).date_start, taxa_status: (e as any).taxa_status });
  }
  const { reservationFee } = await fetchSettings(supabase);

  return (
    <TarefasClient
      valorTaxa={reservationFee}
      initialPendentes={(pendentes ?? []).map((t: any) => mapTask(t, eventos))}
      initialConcluidas={(concluidas ?? []).map((t: any) => mapTask(t))}
    />
  );
}
