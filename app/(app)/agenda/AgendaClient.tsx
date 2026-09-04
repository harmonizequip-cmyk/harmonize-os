"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import NovoEventoModal from "./NovoEventoModal";
import EditarEventoModal from "./EditarEventoModal";

const EVENT_META: Record<string, { label: string; dot: string }> = {
  hipro_1: { label: "HIPRO 1", dot: "bg-brand-teal" },
  hipro_2: { label: "HIPRO 2", dot: "bg-brand-blue" },
  mentoria: { label: "Mentoria", dot: "bg-brand-lilac" },
  outros: { label: "Outro", dot: "bg-brand-pink" },
};

interface EventRow {
  id: string;
  event_type: string;
  title: string;
  date_start: string;
  status: string;
  confirmed: boolean;
  value: number | null;
  client_id: string | null;
  clients?: { name: string } | null;
  rental_id: string | null;
  notes: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

export default function AgendaClient({
  initialEvents,
  clients,
}: {
  initialEvents: EventRow[];
  clients: ClientOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const { needsConfirmation, upcoming } = useMemo(() => {
    const today = startOfToday();
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);

    const needsConfirmation = initialEvents.filter((e) => {
      const d = parseDate(e.date_start);
      return !e.confirmed && d >= today && d <= in7;
    });
    const upcoming = initialEvents.filter((e) => parseDate(e.date_start) >= today);

    return { needsConfirmation, upcoming };
  }, [initialEvents]);

  async function toggleConfirmed(event: EventRow) {
    await supabase.from("calendar_events").update({ confirmed: !event.confirmed }).eq("id", event.id);
    router.refresh();
  }

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  function renderCard(e: EventRow) {
    const meta = EVENT_META[e.event_type] ?? { label: e.event_type, dot: "bg-neutral-400" };
    return (
      <div
        key={e.id}
        onClick={() => setEditingEvent(e)}
        className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${meta.dot}`} />
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{e.title}</p>
              <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                {meta.label} · {formatDate(e.date_start)}
                {e.clients?.name ? ` · ${e.clients.name}` : ""}
              </p>
            </div>
          </div>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              toggleConfirmed(e);
            }}
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
              e.confirmed
                ? "bg-brand-teal/10 text-brand-teal"
                : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            }`}
          >
            {e.confirmed ? "Confirmado ✓" : "Não confirmado"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Agenda</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
        >
          + Novo evento
        </button>
      </div>

      {needsConfirmation.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
          <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-400">
            ⚠️ Precisam de confirmação (próximos 7 dias)
          </p>
          <div className="space-y-2">{needsConfirmation.map(renderCard)}</div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">Próximos eventos</p>
        <div className="space-y-2">
          {upcoming.map(renderCard)}
          {upcoming.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
              Nenhum evento futuro.
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <NovoEventoModal clients={clients} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      )}

      {editingEvent && (
        <EditarEventoModal
          event={editingEvent}
          clients={clients}
          onClose={() => setEditingEvent(null)}
          onSaved={() => {
            setEditingEvent(null);
            router.refresh();
          }}
          onDeleted={() => {
            setEditingEvent(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
