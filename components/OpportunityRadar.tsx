"use client";

import { useMemo, useState } from "react";
import AvailabilityImageModal from "./AvailabilityImageModal";

export interface DormantLead {
  id: string;
  name: string;
  city: string | null;
  whatsapp: string | null;
  stage: string;
}

const STAGE_LABELS: Record<string, string> = {
  nutricao: "Nutrição",
  qualificado: "Interesse",
};

function formatShortDate(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/**
 * Cruza duas coisas que, sozinhas, ninguém para pra somar: dias com os dois
 * HIPROs livres nos próximos 30 dias (equipamento parado = dinheiro parado)
 * e a lista de leads que esfriaram (Nutrição/Interesse, sem data travada).
 * Quando a cidade de um lead parado bate com a cidade de um evento já
 * confirmado no mesmo período, ganha destaque — é viagem que já vai
 * acontecer de qualquer jeito, então fechar esse lead não custa
 * deslocamento extra. O botão de ação já abre o mesmo gerador de imagem de
 * datas disponíveis usado no Funil, com o WhatsApp do lead pronto.
 */
export default function OpportunityRadar({
  freeDays,
  citiesInRoute,
  leads,
}: {
  freeDays: string[];
  citiesInRoute: string[];
  leads: DormantLead[];
}) {
  const [open, setOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<DormantLead | null>(null);

  const routeSet = useMemo(() => new Set(citiesInRoute.map((c) => c.toLowerCase())), [citiesInRoute]);

  const sortedLeads = useMemo(() => {
    const withRoute = leads.map((l) => ({
      ...l,
      nearbyRoute: !!(l.city && routeSet.has(l.city.trim().toLowerCase())),
    }));
    return withRoute.sort((a, b) => {
      if (a.nearbyRoute !== b.nearbyRoute) return a.nearbyRoute ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [leads, routeSet]);

  if (freeDays.length === 0 || leads.length === 0) return null;

  const visibleDays = freeDays.slice(0, 8);
  const extraDays = freeDays.length - visibleDays.length;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-brand-teal/30 bg-brand-teal/5 dark:border-brand-teal/20 dark:bg-brand-teal/10">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm text-brand-teal"
        >
          <span>
            🎯 {freeDays.length} {freeDays.length === 1 ? "dia livre" : "dias livres"} nos próximos 30 dias ·{" "}
            {leads.length} {leads.length === 1 ? "lead parado pode" : "leads parados podem"} preencher
          </span>
          <span className="text-xs">{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="space-y-3 border-t border-brand-teal/20 p-3 pt-2">
            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Datas livres (os 2 HIPROs)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {visibleDays.map((d) => (
                  <span
                    key={d}
                    className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-neutral-600 dark:bg-neutral-900/50 dark:text-neutral-300"
                  >
                    {formatShortDate(d)}
                  </span>
                ))}
                {extraDays > 0 && (
                  <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-neutral-400 dark:bg-neutral-900/50">
                    +{extraDays}
                  </span>
                )}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                Leads parados pra reativar
              </p>
              <div className="space-y-1.5">
                {sortedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-3 py-2 dark:bg-neutral-900/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-neutral-900 dark:text-neutral-100">
                        {lead.name}
                      </p>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {STAGE_LABELS[lead.stage] ?? lead.stage}
                        {lead.city ? ` · ${lead.city}` : ""}
                        {lead.nearbyRoute && (
                          <span className="ml-1 rounded-full bg-brand-pink/15 px-1.5 py-0.5 text-[10px] font-medium text-brand-pink-dark dark:text-brand-pink">
                            📍 já vai estar na região
                          </span>
                        )}
                      </p>
                    </div>
                    {lead.whatsapp ? (
                      <button
                        onClick={() => setSelectedLead(lead)}
                        className="flex-shrink-0 rounded-lg bg-brand-teal/10 px-2.5 py-1.5 text-xs font-medium text-brand-teal"
                      >
                        📅 Enviar datas
                      </button>
                    ) : (
                      <span className="flex-shrink-0 text-[10px] text-neutral-400">sem WhatsApp</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {selectedLead && (
        <AvailabilityImageModal
          mode="funil"
          clientName={selectedLead.name}
          whatsapp={selectedLead.whatsapp}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  );
}
