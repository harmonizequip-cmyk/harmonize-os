"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import NovoLeadModal from "./NovoLeadModal";
import LeadCardModal from "./LeadCardModal";

export const STAGES = [
  { key: "lead", label: "Lead", dot: "bg-neutral-400" },
  { key: "contato", label: "Contato", dot: "bg-brand-blue" },
  { key: "qualificado", label: "Qualificado", dot: "bg-brand-lilac" },
  { key: "agendado", label: "Agendado", dot: "bg-brand-pink" },
  { key: "cliente", label: "Cliente", dot: "bg-brand-teal" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

export interface LeadRow {
  id: string;
  name: string;
  city: string | null;
  whatsapp: string | null;
  stage: StageKey;
  data_evento: string | null;
  tags: string[] | null;
  origem: string | null;
  notes: string | null;
}

export default function FunilClient({ initialClients }: { initialClients: LeadRow[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<LeadRow | null>(null);
  const [search, setSearch] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return initialClients.filter(
      (c) => c.name.toLowerCase().includes(term) || (c.city ?? "").toLowerCase().includes(term)
    );
  }, [initialClients, search]);

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  async function moveToStage(leadId: string, newStage: StageKey) {
    await supabase.from("clients").update({ stage: newStage }).eq("id", leadId);
    router.refresh();
  }

  async function avancarEtapa(lead: LeadRow) {
    const idx = STAGES.findIndex((s) => s.key === lead.stage);
    if (idx === -1 || idx === STAGES.length - 1) return;
    moveToStage(lead.id, STAGES[idx + 1].key);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900">Funil de vendas</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-teal-dark"
        >
          + Novo lead
        </button>
      </div>

      <input
        placeholder="Buscar por nome ou cidade..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-teal sm:max-w-sm"
      />

      <p className="hidden text-xs text-neutral-400 sm:block">
        Arraste os cards entre as colunas, ou use o botão "Avançar →" em cada um.
      </p>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const leads = filtered.filter((c) => c.stage === stage.key);
          return (
            <div
              key={stage.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage.key);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage.key ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const leadId = e.dataTransfer.getData("text/plain");
                if (leadId) moveToStage(leadId, stage.key);
                setDraggedId(null);
                setDragOverStage(null);
              }}
              className={`w-64 flex-shrink-0 rounded-2xl p-3 transition ${
                dragOverStage === stage.key ? "bg-brand-teal/10 ring-2 ring-brand-teal/40" : "bg-neutral-100"
              }`}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={`h-2 w-2 rounded-full ${stage.dot}`} />
                <p className="text-sm font-semibold text-neutral-700">{stage.label}</p>
                <span className="ml-auto text-xs text-neutral-400">{leads.length}</span>
              </div>

              <div className="space-y-2">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", lead.id);
                      setDraggedId(lead.id);
                    }}
                    onDragEnd={() => {
                      setDraggedId(null);
                      setDragOverStage(null);
                    }}
                    onClick={() => setSelected(lead)}
                    className={`cursor-grab rounded-xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-brand-teal active:cursor-grabbing ${
                      draggedId === lead.id ? "opacity-40" : ""
                    }`}
                  >
                    <p className="text-sm font-medium text-neutral-900">{lead.name}</p>
                    {lead.city && <p className="mt-0.5 text-xs text-neutral-500">{lead.city}</p>}
                    {lead.data_evento && (
                      <p className="mt-1 text-xs text-brand-teal">📅 {formatDate(lead.data_evento)}</p>
                    )}
                    {lead.tags && lead.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {lead.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-brand-pink/10 px-2 py-0.5 text-[10px] font-medium text-brand-pink"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                    {stage.key !== "cliente" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          avancarEtapa(lead);
                        }}
                        className="mt-2 w-full rounded-lg bg-neutral-100 py-1.5 text-xs font-medium text-neutral-600 hover:bg-brand-teal/10 hover:text-brand-teal"
                      >
                        Avançar →
                      </button>
                    )}
                  </div>
                ))}
                {leads.length === 0 && (
                  <p className="px-1 py-4 text-center text-xs text-neutral-400">Vazio</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && <NovoLeadModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
      {selected && (
        <LeadCardModal
          lead={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
