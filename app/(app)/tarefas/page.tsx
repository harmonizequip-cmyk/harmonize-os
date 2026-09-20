import { createClient } from "@/lib/supabase/server";
import TarefasClient from "./TarefasClient";

function mapTask(t: any) {
  return {
    id: t.id,
    client_id: t.client_id,
    client_name: Array.isArray(t.clients) ? t.clients[0]?.name ?? null : t.clients?.name ?? null,
    type: t.type,
    follow_up_number: t.follow_up_number,
    title: t.title,
    due_date: t.due_date,
    completed_at: t.completed_at,
  };
}

export default async function TarefasPage() {
  const supabase = createClient();

  const [{ data: pendentes }, { data: concluidas }] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, client_id, type, follow_up_number, title, due_date, completed_at, clients(name)")
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

  return (
    <TarefasClient
      initialPendentes={(pendentes ?? []).map(mapTask)}
      initialConcluidas={(concluidas ?? []).map(mapTask)}
    />
  );
}
