"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";

import { hojeLocal } from "@/lib/period";
interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

// Reserva só o equipamento e a data na Agenda (status 'pre_reserva'), sem
// contagem de disparos e sem lançar nada no financeiro ainda. Quando o
// procedimento acontecer de verdade, essa mesma pré-reserva é finalizada
// (ver CalculadoraLocacaoModal, mode "finalize"), que aí sim cria a
// locação e a transação.
export default function ReservarHiproModal({
  clients,
  equipments,
  defaultDate,
  fixedClientId,
  fixedClientName,
  onClose,
  onCreated,
}: {
  clients: ClientOption[];
  equipments: EquipmentOption[];
  defaultDate?: string;
  fixedClientId?: string;
  fixedClientName?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [localClients, setLocalClients] = useState(clients);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [equipmentId, setEquipmentId] = useState(equipments[0]?.id ?? "");
  const [eventDate, setEventDate] = useState(defaultDate ?? (() => hojeLocal())());
  const [dataFim, setDataFim] = useState("");
  const [notes, setNotes] = useState("");
  const [isMentoria, setIsMentoria] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFixedClient = !!fixedClientId;
  const clientId = isFixedClient ? fixedClientId! : selectedClientId;
  const clientName = isFixedClient ? fixedClientName ?? "" : localClients.find((c) => c.id === clientId)?.name ?? "";

  // E7: aviso (não bloqueia) quando o mesmo cliente já tem outro HIPRO
  // reservado no mesmo dia — cenário mais provável de ser engano de
  // digitação do que um caso real de dois procedimentos no mesmo dia.
  const [outroEquipAviso, setOutroEquipAviso] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setOutroEquipAviso(null);
    if (!clientId || !equipmentId || !eventDate) return;
    supabase
      .from("calendar_events")
      .select("equipment_id, equipments(name)")
      .eq("client_id", clientId)
      .eq("date_start", eventDate)
      .neq("status", "cancelada")
      .not("equipment_id", "is", null)
      .neq("equipment_id", equipmentId)
      .limit(1)
      .then(({ data }) => {
        if (!active) return;
        const outro = data?.[0] as any;
        if (!outro) return;
        const outroNome = (Array.isArray(outro.equipments) ? outro.equipments[0] : outro.equipments)?.name ?? "outro equipamento";
        setOutroEquipAviso(`⚠️ ${clientName || "Este cliente"} já tem uma reserva no ${outroNome} neste mesmo dia. Confirme se não é engano antes de reservar também aqui.`);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, equipmentId, eventDate]);

  async function handleSave() {
    if (!clientId || !equipmentId || !eventDate) {
      setError("Preencha cliente, equipamento e data.");
      return;
    }
    if (dataFim && dataFim <= eventDate) {
      setError("A data final precisa ser depois da data inicial.");
      return;
    }
    const confirmMsg = outroEquipAviso
      ? `${outroEquipAviso}\n\nReservar mesmo assim?`
      : "Reservar este equipamento para essa data? A contagem de disparos e o valor entram depois, quando o procedimento acontecer.";
    if (!window.confirm(confirmMsg)) {
      return;
    }
    setSaving(true);
    setError(null);

    const equipment = equipments.find((e) => e.id === equipmentId);

    const { error: insertError } = await supabase.from("calendar_events").insert({
      event_type: equipment?.code ?? "outros",
      title: `Reserva HIPRO - ${clientName}`,
      client_id: clientId,
      equipment_id: equipmentId,
      date_start: eventDate,
      date_end: dataFim || eventDate,
      status: "pre_reserva",
      notes: notes || null,
      is_mentoria: isMentoria,
    });

    setSaving(false);

    if (insertError) {
      if ((insertError as { code?: string }).code === "23P01") {
        setError(`⚠️ ${equipment?.name ?? "Esse equipamento"} já está reservado nessa data.`);
      } else {
        setError(insertError.message || "Não foi possível salvar a reserva. Tente novamente.");
      }
      return;
    }

    onCreated();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Reservar HIPRO Day</h2>
        <p className="mb-4 text-xs text-neutral-400">
          Trava a data no equipamento sem exigir contagem de disparos. Finalize com a contagem depois de realizado.
        </p>

        <div className="space-y-3">
          {isFixedClient ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Cliente</label>
              <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                {fixedClientName}
              </p>
            </div>
          ) : (
            <ClientPicker
              clients={localClients}
              value={selectedClientId}
              onChange={setSelectedClientId}
              onClientCreated={(c) => setLocalClients((prev) => [...prev, c])}
            />
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Equipamento</label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Data final (só se for mais de um dia)
            </label>
            <input
              type="date"
              value={dataFim}
              min={eventDate}
              onChange={(e) => setDataFim(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            {dataFim && (
              <p className="mt-1 text-xs text-neutral-500">Uma reserva só, com uma taxa de reserva só.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {/* Só destaque visual na Agenda (ver EVENT_META em
              AgendaClient.tsx) — continua reservando o equipamento
              normalmente, com a mesma proteção contra duplo-agendamento. */}
          <label className="flex items-center gap-2 text-sm text-neutral-600 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={isMentoria}
              onChange={(e) => setIsMentoria(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-300 text-brand-teal focus:ring-brand-teal dark:border-neutral-700"
            />
            Esta reserva é para mentoria
          </label>
        </div>

        {outroEquipAviso && (
          <p className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-400">
            {outroEquipAviso}
          </p>
        )}

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving ? "Reservando..." : "Reservar"}
          </button>
        </div>
      </div>
    </div>
  );
}
