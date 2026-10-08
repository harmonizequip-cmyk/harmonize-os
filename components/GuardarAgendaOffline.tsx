"use client";

// Guarda no aparelho os atendimentos de hoje até daqui a 7 dias (cliente,
// telefone, endereço, equipamento, contagem inicial, saldo), para a página
// /sem-internet.html mostrar quando abrir o app sem sinal. Atualiza ao
// abrir o app, ao voltar a internet e a cada 30 minutos com ele aberto.

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { hojeLocal, somarDias } from "@/lib/period";

export const CHAVE_AGENDA_OFFLINE = "harmonize-agenda-offline";
const INTERVALO = 30 * 60 * 1000;
const DIAS = 7;

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

async function guardar() {
  if (!navigator.onLine) return;
  const supabase = createClient();
  const hoje = hojeLocal();
  const { data, error } = await supabase
    .from("calendar_events")
    .select(
      "id, event_type, title, date_start, date_end, time_start, notes, taxa_status, taxa_valor, rental_id, contagem_inicial, is_mentoria, clients(name, whatsapp, address, city), equipments(name)"
    )
    .eq("is_test", false)
    .neq("status", "cancelada")
    .gte("date_end", hoje)
    .lte("date_start", somarDias(hoje, DIAS))
    .order("date_start", { ascending: true })
    .order("time_start", { ascending: true, nullsFirst: true })
    .limit(100);
  if (error || !data) return;

  const idsLocacao = data.map((e: any) => e.rental_id).filter(Boolean);
  const saldos = new Map<string, number>();
  if (idsLocacao.length) {
    const { data: s } = await supabase
      .from("rentals_situacao_pagamento")
      .select("rental_id, saldo")
      .in("rental_id", idsLocacao);
    for (const x of s ?? []) saldos.set((x as any).rental_id, Number((x as any).saldo));
  }

  const itens = data.map((e: any) => {
    const c = um<any>(e.clients);
    return {
      inicio: e.date_start,
      fim: e.date_end,
      hora: e.time_start ? String(e.time_start).slice(0, 5) : null,
      titulo: e.title,
      equipamento: um<any>(e.equipments)?.name ?? (e.is_mentoria ? "Mentoria" : null),
      cliente: c?.name ?? null,
      whatsapp: c?.whatsapp ?? null,
      endereco: [c?.address, c?.city].filter(Boolean).join(" · ") || null,
      notas: e.notes ?? null,
      contagemInicial: e.contagem_inicial != null ? Number(e.contagem_inicial) : null,
      taxaPendente: e.taxa_status === "pendente" ? Number(e.taxa_valor ?? 0) : null,
      saldo: e.rental_id ? (saldos.get(e.rental_id) ?? 0) : null,
      semDisparos: !e.rental_id && !e.is_mentoria && e.event_type !== "outros",
    };
  });

  try {
    localStorage.setItem(CHAVE_AGENDA_OFFLINE, JSON.stringify({ geradoEm: new Date().toISOString(), hoje, itens }));
  } catch {
    // Sem espaço ou modo privado: segue sem a cópia.
  }
}

export default function GuardarAgendaOffline() {
  useEffect(() => {
    guardar();
    const vez = window.setInterval(() => {
      if (document.visibilityState === "visible") guardar();
    }, INTERVALO);
    window.addEventListener("online", guardar);
    return () => {
      window.clearInterval(vez);
      window.removeEventListener("online", guardar);
    };
  }, []);
  return null;
}
