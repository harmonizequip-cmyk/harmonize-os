"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { STAGES, type LeadRow, type TagOption } from "./FunilClient";
import { buildMapsLink, buildWazeLink, buildWhatsAppLink, extractCityFromAddress, toUpperOrNull } from "@/lib/format";
import AvailabilityImageModal from "@/components/AvailabilityImageModal";
import NovaTarefaModal from "./NovaTarefaModal";
import AgendamentosDoCliente from "@/components/AgendamentosDoCliente";

const QUICK_COLOR = "#3DBFB8";

export default function LeadCardModal({
  lead,
  allTags,
  onClose,
  onSaved,
}: {
  lead: LeadRow;
  allTags: TagOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [stage, setStage] = useState(lead.stage);
  const [dataEvento, setDataEvento] = useState(lead.data_evento ?? "");
  const [city, setCity] = useState(lead.city ?? "");
  const [address, setAddress] = useState(lead.address ?? "");
  const [availableTags, setAvailableTags] = useState<TagOption[]>(allTags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(lead.tags.map((t) => t.id));
  const [newTagName, setNewTagName] = useState("");
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [parceiro, setParceiro] = useState(lead.parceiro ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false);

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    const { data, error: createError } = await supabase
      .from("tags")
      .insert({ name, color: QUICK_COLOR })
      .select("id, name, color")
      .single();
    if (createError || !data) {
      setError(createError?.code === "23505" ? "Já existe uma tag com esse nome." : "Não foi possível criar a tag.");
      return;
    }
    setAvailableTags((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedTagIds((prev) => [...prev, data.id]);
    setNewTagName("");
  }

  async function handleSave() {
    if (!window.confirm("Salvar essas alterações?")) return;
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        stage,
        data_evento: dataEvento || null,
        city: toUpperOrNull(city),
        address: toUpperOrNull(address),
        notes: notes || null,
        parceiro,
      })
      .eq("id", lead.id);

    if (updateError) {
      setSaving(false);
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }

    // Sincroniza as tags: só grava o que mudou desde a abertura do modal.
    const originalIds = lead.tags.map((t) => t.id);
    const toAdd = selectedTagIds.filter((id) => !originalIds.includes(id));
    const toRemove = originalIds.filter((id) => !selectedTagIds.includes(id));

    if (toAdd.length > 0) {
      await supabase.from("client_tags").insert(toAdd.map((tag_id) => ({ client_id: lead.id, tag_id })));
    }
    if (toRemove.length > 0) {
      await supabase.from("client_tags").delete().eq("client_id", lead.id).in("tag_id", toRemove);
    }

    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{lead.name}</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Etapa</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as typeof stage)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data do evento</label>
            <input
              type="date"
              value={dataEvento}
              onChange={(e) => setDataEvento(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Cidade</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Endereço (opcional)</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              onBlur={() => {
                if (!city.trim()) {
                  const detected = extractCityFromAddress(address);
                  if (detected) setCity(detected);
                }
              }}
              placeholder="Rua, número, bairro"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {availableTags.map((t) => {
                const active = selectedTagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
                    style={active ? { backgroundColor: t.color, color: "#fff" } : { backgroundColor: `${t.color}1A`, color: t.color }}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nova tag..."
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <button
                type="button"
                onClick={handleCreateTag}
                disabled={!newTagName.trim()}
                className="rounded-lg border border-brand-teal px-3 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {/* O campo "Taxa de reserva" saiu daqui. Ele guardava UMA taxa
              por cliente, e quem reserva cinco datas deve cinco taxas: a
              taxa de cada agendamento fica na lista de Agendamentos, logo
              abaixo. O que continua sendo do cliente é ser parceiro, que
              é uma característica da relação e não de uma data. */}
          <label className="flex items-start gap-2.5 rounded-lg border border-neutral-300 p-3 dark:border-neutral-700">
            <input
              type="checkbox"
              checked={parceiro}
              onChange={(e) => setParceiro(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-teal"
            />
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              <span className="block text-sm font-medium text-neutral-800 dark:text-neutral-100">
                Parceiro
              </span>
              Reserva data sem pagar a taxa de compromisso. Os agendamentos deste cliente nascem
              isentos, sem ninguém precisar lembrar disso a cada reserva.
            </span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        {(lead.whatsapp || buildMapsLink(address)) && (
          <div className="mt-4 flex gap-2">
            {buildWhatsAppLink(lead.whatsapp) && (
              <a
                href={buildWhatsAppLink(lead.whatsapp)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-sm text-brand-teal underline underline-offset-2"
              >
                WhatsApp
              </a>
            )}
            {buildMapsLink(address) && (
              <a
                href={buildMapsLink(address)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-sm text-brand-blue underline underline-offset-2"
              >
                Maps
              </a>
            )}
            {buildWazeLink(address) && (
              <a
                href={buildWazeLink(address)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-center text-sm text-brand-lilac underline underline-offset-2"
              >
                Waze
              </a>
            )}
          </div>
        )}

        {/* Os botões de status de cada agendamento (confirmar, reagendar,
            realizar, cancelar) vivem num componente próprio porque a mesma
            lista precisa aparecer também na ficha completa do cliente. Cada
            ação chama uma função do banco, que é quem valida conflito de
            data e registra no histórico de movimentações. */}
        <AgendamentosDoCliente clientId={lead.id} onChanged={() => router.refresh()} />

        <button
          type="button"
          onClick={() => setAvailabilityOpen(true)}
          className="mt-4 w-full rounded-xl border border-brand-teal py-2 text-xs font-medium text-brand-teal"
        >
          📅 Enviar datas disponíveis
        </button>

        <button
          type="button"
          onClick={() => setNovaTarefaOpen(true)}
          className="mt-2 w-full rounded-xl border border-brand-blue py-2 text-xs font-medium text-brand-blue"
        >
          🗒️ Nova tarefa para este cliente
        </button>

        <Link href={`/clientes/${lead.id}`} className="mt-2 block text-center text-xs text-neutral-400 underline">
          Ver perfil completo
        </Link>

        <div className="mt-4 flex gap-2">
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
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>

      {availabilityOpen && (
        <AvailabilityImageModal
          mode="funil"
          clientName={lead.name}
          whatsapp={lead.whatsapp}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}

      {novaTarefaOpen && (
        <NovaTarefaModal
          lockedClientId={lead.id}
          lockedClientName={lead.name}
          onClose={() => setNovaTarefaOpen(false)}
          onCreated={() => {
            setNovaTarefaOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
