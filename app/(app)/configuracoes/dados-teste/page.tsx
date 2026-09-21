import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DadosTesteClient, { type TestRecord } from "./DadosTesteClient";

// Sempre buscar do banco: esta tela existe justamente pra conferir o
// estado atual da marcação antes de apagar alguma coisa, então servir
// uma versão em cache seria pior que não ter a tela.
export const dynamic = "force-dynamic";

function oneOf<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DadosTestePage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  // Guarda de tela. A de verdade está no banco (require_admin dentro de
  // cada função), esta aqui é só pra não mostrar botão que não vai
  // funcionar.
  if (!profile?.is_admin) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Dados de teste</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Esta área é restrita a administradores.
        </p>
        <Link href="/configuracoes" className="text-sm text-brand-blue underline underline-offset-2">
          Voltar para Configurações
        </Link>
      </div>
    );
  }

  // Se a migração do modo teste ainda não rodou, a coluna não existe e
  // esta query falha. Em vez de quebrar a tela com erro cru, a gente
  // detecta e explica o que falta fazer.
  const { data: settingsRow, error: settingsError } = await supabase
    .from("settings")
    .select("test_mode")
    .eq("id", true)
    .single();

  if (settingsError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Dados de teste</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/20 dark:text-amber-300">
          <p className="font-medium">A migração do modo teste ainda não foi aplicada no banco.</p>
          <p className="mt-1">
            Rode o arquivo <code className="font-mono">migrations/2026-09-21-modo-teste.sql</code> no SQL Editor do
            Supabase e recarregue esta página.
          </p>
        </div>
      </div>
    );
  }

  const [
    { data: clients },
    { data: transactions },
    { data: rentals },
    { data: events },
    { data: tasks },
    { data: mentorings },
  ] = await Promise.all([
    supabase.from("clients").select("id, name, created_at").eq("is_test", true).order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select("id, description, amount, date, type, clients(name)")
      .eq("is_test", true)
      .order("date", { ascending: false }),
    supabase
      .from("rentals")
      .select("id, event_date, calculated_value, clients(name)")
      .eq("is_test", true)
      .order("event_date", { ascending: false }),
    supabase
      .from("calendar_events")
      .select("id, title, date_start")
      .eq("is_test", true)
      .order("date_start", { ascending: false }),
    supabase.from("tasks").select("id, title, due_date").eq("is_test", true).order("due_date", { ascending: false }),
    supabase
      .from("mentoring_events")
      .select("id, mentee_name, date")
      .eq("is_test", true)
      .order("date", { ascending: false }),
  ]);

  const records: TestRecord[] = [
    ...(clients ?? []).map((c) => ({
      table: "clients" as const,
      id: c.id as string,
      label: (c.name as string) ?? "(sem nome)",
      detail: "Cliente",
      date: (c.created_at as string)?.slice(0, 10) ?? null,
      amount: null,
    })),
    ...(transactions ?? []).map((t) => ({
      table: "transactions" as const,
      id: t.id as string,
      label: (t.description as string) ?? "(sem descrição)",
      detail: `Lançamento · ${t.type === "entrada" ? "Entrada" : "Saída"}${
        oneOf(t.clients as { name: string } | { name: string }[])?.name
          ? ` · ${oneOf(t.clients as { name: string } | { name: string }[])?.name}`
          : ""
      }`,
      date: (t.date as string) ?? null,
      amount: Number(t.amount),
    })),
    ...(rentals ?? []).map((r) => ({
      table: "rentals" as const,
      id: r.id as string,
      label: oneOf(r.clients as { name: string } | { name: string }[])?.name ?? "(sem cliente)",
      detail: "Locação",
      date: (r.event_date as string) ?? null,
      amount: Number(r.calculated_value),
    })),
    ...(events ?? []).map((e) => ({
      table: "calendar_events" as const,
      id: e.id as string,
      label: (e.title as string) ?? "(sem título)",
      detail: "Evento da agenda",
      date: (e.date_start as string) ?? null,
      amount: null,
    })),
    ...(mentorings ?? []).map((m) => ({
      table: "mentoring_events" as const,
      id: m.id as string,
      label: (m.mentee_name as string) ?? "(sem nome)",
      detail: "Mentoria",
      date: (m.date as string) ?? null,
      amount: null,
    })),
    ...(tasks ?? []).map((t) => ({
      table: "tasks" as const,
      id: t.id as string,
      label: (t.title as string) ?? "(sem título)",
      detail: "Tarefa",
      date: (t.due_date as string) ?? null,
      amount: null,
    })),
  ];

  return (
    <DadosTesteClient
      initialTestMode={!!settingsRow?.test_mode}
      initialRecords={records}
      userEmail={user.email ?? ""}
    />
  );
}
