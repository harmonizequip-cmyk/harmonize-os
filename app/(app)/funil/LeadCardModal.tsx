"use client";

import CaixaIsencaoTaxa from "@/components/CaixaIsencaoTaxa";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LEAD_STAGES, type LeadRow, type TagOption } from "./FunilClient";
import { CLIENT_STAGES } from "@/lib/funil-clientes";
import { buildMapsLink, buildWazeLink, buildWhatsAppLink, extractCityFromAddress, toUpperOrNull } from "@/lib/format";
import AvailabilityImageModal from "@/components/AvailabilityImageModal";
import TabelaPrecosModal from "@/components/TabelaPrecosModal";
import NovaTarefaModal from "./NovaTarefaModal";
import AgendamentosDoCliente from "@/components/AgendamentosDoCliente";
import IndicadoPorSelect from "@/components/IndicadoPorSelect";

import { hojeLocal } from "@/lib/period";
import { confirmar } from "@/components/Dialogos";
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
  const [isentoTaxa, setIsentoTaxa] = useState(lead.isento_taxa ?? false);
  const [indicadoPor, setIndicadoPor] = useState<string | null>(
    (lead as LeadRow & { indicado_por?: string | null }).indicado_por ?? null
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [tabelaOpen, setTabelaOpen] = useState(false);
  const [novaTarefaOpen, setNovaTarefaOpen] = useState(false);

  // Faixa de badges (concluídas / canceladas / reagendadas) no topo do
  // modal, igual já existe na ficha completa do cliente. Carregada à
  // parte porque o LeadRow não traz esses números prontos.
  const [stats, setStats] = useState<{ concluidas: number; canceladas: number; reagendadas: number } | null>(null);

  useEffect(() => {
    let active = true;
    async function carregarStats() {
      const [rentalsRes, reagendadasReservaRes] = await Promise.all([
        supabase.from("rentals").select("status, rescheduled, event_date").eq("client_id", lead.id),
        supabase
          .from("calendar_events")
          .select("id", { count: "exact", head: true })
          .eq("client_id", lead.id)
          .eq("rescheduled", true)
          .is("rental_id", null),
      ]);
      if (!active) return;
      const rentals = rentalsRes.data ?? [];
      setStats({
        // Mesma regra do Dashboard: evento antes de hoje e não cancelado
        // (o status "realizada" quase nunca é marcado à mão).
        concluidas: rentals.filter((r) => r.status !== "cancelada" && r.event_date < hojeLocal()).length,
        canceladas: rentals.filter((r) => r.status === "cancelada").length,
        reagendadas: rentals.filter((r) => r.rescheduled).length + (reagendadasReservaRes.count ?? 0),
      });
    }
    carregarStats();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

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

  // Conversão manual: para quem já é cliente de antes do sistema (ou não
  // aluga há tempos) e por isso não tem locação registrada aqui. O gatilho
  // do banco liga is_client quando a etapa vira "cliente", e a partir daí
  // o contato aparece na aba Clientes, na etapa calculada (em geral
  // Reativar, por não ter locação recente).
  async function handleConverterEmCliente() {
    if (
      !(await confirmar({
        titulo: `Mover ${lead.name} para o funil de clientes?`,
        texto: "Ele sai da aba Leads e essa mudança não é desfeita por aqui.",
        confirmar: "Mover",
      }))
    )
      return;
    setSaving(true);
    setError(null);
    const { error: convError } = await supabase.from("clients").update({ stage: "cliente" }).eq("id", lead.id);
    setSaving(false);
    if (convError) {
      setError("Não foi possível mover para clientes. Tente novamente.");
      return;
    }
    onSaved();
  }

  async function handleSave() {
    if (!(await confirmar({ titulo: "Salvar as alterações?", confirmar: "Salvar" }))) return;
    setSaving(true);
    setError(null);

    const { error: updateError } = await supabase
      .from("clients")
      .update({
        // Etapa de cliente é automática: só lead grava etapa por aqui.
        ...(lead.is_client ? {} : { stage }),
        data_evento: dataEvento || null,
        city: toUpperOrNull(city),
        address: toUpperOrNull(address),
        notes: notes || null,
        parceiro,
        isento_taxa: isentoTaxa,
        indicado_por: indicadoPor,
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">{lead.name}</h2>

        {stats && (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-brand-teal/10 px-3 py-1 font-medium text-brand-teal">
              ✓ {stats.concluidas} concluída{stats.concluidas === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-brand-pink/10 px-3 py-1 font-medium text-brand-pink">
              ✕ {stats.canceladas} cancelada{stats.canceladas === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-medium text-brand-blue">
              ↻ {stats.reagendadas} reagendada{stats.reagendadas === 1 ? "" : "s"}
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Etapa</label>
            {lead.is_client ? (
              <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-700">
                {CLIENT_STAGES.find((s) => s.key === lead.clientStage)?.label ?? "Cliente"}
                <span className="ml-1.5 text-xs text-neutral-400">(automática)</span>
              </p>
            ) : (
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as typeof stage)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                {LEAD_STAGES.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            )}
            {!lead.is_client && (
              <button
                type="button"
                disabled={saving}
                onClick={handleConverterEmCliente}
                className="mt-2 w-full rounded-lg border border-brand-teal/40 py-1.5 text-xs font-medium text-brand-teal hover:bg-brand-teal/5 disabled:opacity-50"
              >
                Já é cliente: mover para o funil de clientes
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Data do evento</label>
            <input
              type="date"
              value={dataEvento}
              onChange={(e) => setDataEvento(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Cidade</label>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Endereço (opcional)</label>
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Tags</label>
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
                className="flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs"
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

          <IndicadoPorSelect value={indicadoPor} onChange={setIndicadoPor} excludeId={lead.id} />

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {/* O campo "Taxa de reserva" saiu daqui. Ele guardava UMA taxa
              por cliente, e quem reserva cinco datas deve cinco taxas: a
              taxa de cada agendamento fica na lista de Agendamentos, logo
              abaixo. O que continua sendo do cliente é ser parceiro, que
              é uma característica da relação e não de uma data. */}
          <label className="flex items-start gap-2.5 rounded-lg border border-neutral-300 p-3">
            <input
              type="checkbox"
              checked={parceiro}
              onChange={(e) => setParceiro(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-teal"
            />
            <span className="text-xs text-neutral-600">
              <span className="block text-sm font-medium text-neutral-800">
                Parceiro
              </span>
              Reserva data sem pagar a taxa de compromisso. Os agendamentos deste cliente nascem
              isentos, sem ninguém precisar lembrar disso a cada reserva.
            </span>
          </label>
          <CaixaIsencaoTaxa checked={isentoTaxa} onChange={setIsentoTaxa} parceiro={parceiro} />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

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
          onClick={() => setTabelaOpen(true)}
          className="mt-2 w-full rounded-xl border border-brand-pink py-2 text-xs font-medium text-brand-pink"
        >
          🏷️ Enviar tabela de preços
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
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
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
          treatment={lead.treatment}
          displayName={lead.display_name}
          whatsapp={lead.whatsapp}
          onClose={() => setAvailabilityOpen(false)}
        />
      )}

      {tabelaOpen && (
        <TabelaPrecosModal
          clientName={lead.name}
          treatment={lead.treatment}
          displayName={lead.display_name}
          whatsapp={lead.whatsapp}
          onClose={() => setTabelaOpen(false)}
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
