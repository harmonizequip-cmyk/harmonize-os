"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import NovoEventoModal from "./NovoEventoModal";
import EditarEventoModal from "./EditarEventoModal";
import ReservarHiproModal from "./ReservarHiproModal";

const EVENT_META: Record<string, { label: string; dot: string }> = {
  hipro_1: { label: "HIPRO 1", dot: "bg-brand-teal" },
  hipro_2: { label: "HIPRO 2", dot: "bg-brand-blue" },
  mentoria: { label: "Mentoria", dot: "bg-brand-lilac" },
  outros: { label: "Outro", dot: "bg-brand-pink" },
};

const WEEKDAY_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];

interface EventRow {
  id: string;
  event_type: string;
  title: string;
  date_start: string;
  status: string;
  confirmed: boolean;
  value: number | null;
  client_id: string | null;
  equipment_id: string | null;
  clients?: { name: string; whatsapp?: string | null } | null;
  rental_id: string | null;
  notes: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

function toDateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

function parseDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

export default function AgendaClient({
  initialEvents,
  clients,
  equipments,
}: {
  initialEvents: EventRow[];
  clients: ClientOption[];
  equipments: EquipmentOption[];
}) {
  const router = useRouter();
  const supabase = createClient();

  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [addChooserOpen, setAddChooserOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [reservaModalOpen, setReservaModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventRow[]>();
    for (const e of initialEvents) {
      const list = map.get(e.date_start) ?? [];
      list.push(e);
      map.set(e.date_start, list);
    }
    return map;
  }, [initialEvents]);

  const needsConfirmation = useMemo(() => {
    const today = parseDate(toDateKey(new Date()));
    const in7 = new Date(today);
    in7.setDate(in7.getDate() + 7);
    return initialEvents.filter((e) => {
      const d = parseDate(e.date_start);
      return !e.confirmed && d >= today && d <= in7;
    });
  }, [initialEvents]);

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const selectedDayEvents = eventsByDate.get(selectedDate) ?? [];

  async function toggleConfirmed(event: EventRow) {
    await supabase.from("calendar_events").update({ confirmed: !event.confirmed }).eq("id", event.id);
    router.refresh();
  }

  function handleCreated() {
    setModalOpen(false);
    setReservaModalOpen(false);
    router.refresh();
  }

  function goToToday() {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDate(toDateKey(new Date()));
  }

  function renderCard(e: EventRow) {
    const meta = EVENT_META[e.event_type] ?? { label: e.event_type, dot: "bg-neutral-400" };
    const isPending = !e.rental_id && !!e.equipment_id && e.status === "pre_reserva";
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
                {meta.label}
                {e.clients?.name ? ` · ${e.clients.name}` : ""}
                {isPending ? " · sem disparos ainda" : ""}
              </p>
            </div>
          </div>
          {isPending ? (
            <span className="whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Pendente
            </span>
          ) : (
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
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Agenda</h1>
        <button
          onClick={goToToday}
          className="self-start rounded-xl border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300 sm:self-auto"
        >
          Hoje
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

      <div className="rounded-2xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
        <div className="mb-3 flex items-center justify-between">
          <button
            onClick={() => setCurrentMonth((m) => subMonths(m, 1))}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <p className="text-sm font-semibold capitalize text-neutral-900 dark:text-neutral-100">
            {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
          </p>
          <button
            onClick={() => setCurrentMonth((m) => addMonths(m, 1))}
            className="rounded-lg px-2 py-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            aria-label="Próximo mês"
          >
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-y-1 text-center">
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={i} className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">
              {w}
            </div>
          ))}

          {gridDays.map((day) => {
            const key = toDateKey(day);
            const dayEvents = eventsByDate.get(key) ?? [];
            const inMonth = isSameMonth(day, currentMonth);
            const selected = key === selectedDate;
            const today = isToday(day);

            return (
              <button
                key={key}
                onClick={() => setSelectedDate(key)}
                className={`relative mx-auto flex h-10 w-10 flex-col items-center justify-center rounded-full text-xs transition ${
                  selected
                    ? "bg-brand-gradient font-semibold text-white shadow-glow-teal"
                    : today
                    ? "border border-brand-teal text-brand-teal"
                    : inMonth
                    ? "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    : "text-neutral-300 dark:text-neutral-700"
                }`}
              >
                <span>{day.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span className="mt-0.5 flex gap-0.5">
                    {dayEvents.slice(0, 3).map((e, i) => (
                      <span
                        key={i}
                        className={`h-1 w-1 rounded-full ${
                          selected ? "bg-white" : EVENT_META[e.event_type]?.dot ?? "bg-neutral-400"
                        }`}
                      />
                    ))}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
            {formatDate(selectedDate)}
          </p>
          <button
            onClick={() => setAddChooserOpen((v) => !v)}
            className="rounded-xl bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
          >
            + Adicionar
          </button>
        </div>

        {addChooserOpen && (
          <div className="mb-3 flex gap-2">
            <button
              onClick={() => {
                setAddChooserOpen(false);
                setReservaModalOpen(true);
              }}
              className="flex-1 rounded-xl border border-brand-teal py-2 text-xs font-medium text-brand-teal"
            >
              Reservar HIPRO
            </button>
            <button
              onClick={() => {
                setAddChooserOpen(false);
                setModalOpen(true);
              }}
              className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Outro evento
            </button>
          </div>
        )}

        <div className="space-y-2">
          {selectedDayEvents.map(renderCard)}
          {selectedDayEvents.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
              Nenhum evento nesse dia.
            </div>
          )}
        </div>
      </div>

      {modalOpen && (
        <NovoEventoModal
          clients={clients}
          defaultDate={selectedDate}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {reservaModalOpen && (
        <ReservarHiproModal
          clients={clients}
          equipments={equipments}
          defaultDate={selectedDate}
          onClose={() => setReservaModalOpen(false)}
          onCreated={handleCreated}
        />
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
