"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Search, X } from "lucide-react";

interface ClientHit {
  id: string;
  name: string;
  whatsapp: string | null;
}

interface TaskHit {
  id: string;
  title: string;
  client_name: string | null;
}

interface EventHit {
  id: string;
  title: string;
  date_start: string;
  client_name: string | null;
}

// Busca acessível de qualquer tela (fica no cabeçalho/menu, ver
// MobileHeader e Sidebar) pra não precisar navegar até Clientes, Tarefas
// ou Agenda só pra procurar um nome. Cruza as três tabelas de uma vez e
// manda pra tela e o item certos ao clicar num resultado.
export default function GlobalSearch({ compact }: { compact?: boolean }) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [clientHits, setClientHits] = useState<ClientHit[]>([]);
  const [taskHits, setTaskHits] = useState<TaskHit[]>([]);
  const [eventHits, setEventHits] = useState<EventHit[]>([]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setClientHits([]);
      setTaskHits([]);
      setEventHits([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timeout = setTimeout(async () => {
      const [{ data: clientsData }, { data: tasksData }, { data: eventsData }] = await Promise.all([
        supabase.from("clients").select("id, name, whatsapp").ilike("name", `%${term}%`).order("name").limit(5),
        supabase.from("tasks").select("id, title, clients(name)").ilike("title", `%${term}%`).limit(5),
        supabase
          .from("calendar_events")
          .select("id, title, date_start, clients(name)")
          .ilike("title", `%${term}%`)
          .order("date_start", { ascending: false })
          .limit(5),
      ]);
      setClientHits(clientsData ?? []);
      setTaskHits(
        (tasksData ?? []).map((t: any) => ({
          id: t.id,
          title: t.title,
          client_name: (Array.isArray(t.clients) ? t.clients[0] : t.clients)?.name ?? null,
        }))
      );
      setEventHits(
        (eventsData ?? []).map((e: any) => ({
          id: e.id,
          title: e.title,
          date_start: e.date_start,
          client_name: (Array.isArray(e.clients) ? e.clients[0] : e.clients)?.name ?? null,
        }))
      );
      setLoading(false);
      setSearched(true);
    }, 300);
    return () => clearTimeout(timeout);
  }, [query, supabase]);

  function goTo(path: string) {
    setOpen(false);
    setQuery("");
    router.push(path);
  }

  function close() {
    setOpen(false);
    setQuery("");
  }

  const noResults = searched && !loading && clientHits.length === 0 && taskHits.length === 0 && eventHits.length === 0;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Buscar"
        className={
          compact
            ? "flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            : "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        }
      >
        <Search size={compact ? 18 : 17} strokeWidth={1.75} className={compact ? "" : "text-neutral-400 dark:text-neutral-500"} />
        {!compact && <span>Buscar</span>}
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 pt-16 sm:pt-24" onClick={close}>
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <Search size={18} className="text-neutral-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cliente, tarefa, evento..."
                className="flex-1 bg-transparent text-sm outline-none dark:text-neutral-100"
              />
              <button onClick={close} aria-label="Fechar" className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300">
                <X size={18} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-2">
              {query.trim().length < 2 && (
                <p className="px-3 py-6 text-center text-sm text-neutral-400">Digite ao menos 2 letras pra buscar.</p>
              )}
              {loading && <p className="px-3 py-6 text-center text-sm text-neutral-400">Buscando...</p>}
              {noResults && <p className="px-3 py-6 text-center text-sm text-neutral-400">Nada encontrado.</p>}

              {clientHits.length > 0 && (
                <div className="mb-2">
                  <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Clientes</p>
                  {clientHits.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => goTo(`/clientes/${c.id}`)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      {c.name}
                      {c.whatsapp && <span className="ml-2 text-xs text-neutral-400">{c.whatsapp}</span>}
                    </button>
                  ))}
                </div>
              )}

              {taskHits.length > 0 && (
                <div className="mb-2">
                  <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Tarefas</p>
                  {taskHits.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => goTo(`/tarefas?highlight=${t.id}`)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      {t.title}
                      {t.client_name && <span className="ml-2 text-xs text-neutral-400">{t.client_name}</span>}
                    </button>
                  ))}
                </div>
              )}

              {eventHits.length > 0 && (
                <div>
                  <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Agenda</p>
                  {eventHits.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => goTo(`/agenda?date=${e.date_start}`)}
                      className="block w-full rounded-lg px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      {e.title}
                      {e.client_name && <span className="ml-2 text-xs text-neutral-400">{e.client_name}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
