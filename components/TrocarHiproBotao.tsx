"use client";

// Trocar o HIPRO de um agendamento (26/11/2026, pedido do dono): passa a
// reserva ou locação do HIPRO 1 para o HIPRO 2 e vice-versa, pela função
// trocar_hipro_agendamento (confere bloqueio, manutenção e se a contagem já
// começou). Se o outro HIPRO estiver com UM atendimento no período, oferece
// trocar os dois de aparelho entre si; com mais de um, explica que não dá.

import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar, confirmar } from "@/components/Dialogos";
import { formatDate } from "@/lib/format";

const ROTULO: Record<string, string> = { hipro_1: "HIPRO 1", hipro_2: "HIPRO 2" };

export function outroHipro(tipo: string): string | null {
  return tipo === "hipro_1" ? "hipro_2" : tipo === "hipro_2" ? "hipro_1" : null;
}

export default function TrocarHiproBotao({
  eventId,
  eventType,
  dateStart,
  dateEnd,
  onTrocado,
  className = "",
}: {
  eventId: string;
  eventType: string;
  dateStart: string;
  dateEnd?: string | null;
  onTrocado: () => void;
  className?: string;
}) {
  const [trocando, setTrocando] = useState(false);
  const outro = outroHipro(eventType);
  if (!outro) return null;
  const de = ROTULO[eventType];
  const para = ROTULO[outro];

  async function trocar() {
    const supabase = createClient();
    const fim = dateEnd && dateEnd > dateStart ? dateEnd : dateStart;
    setTrocando(true);
    // Quem já está no outro HIPRO no mesmo período.
    const { data: ocupantes, error: erroLer } = await supabase
      .from("calendar_events")
      .select("id, title, date_start, date_end, clients(name)")
      .eq("event_type", outro)
      .neq("status", "cancelada")
      .neq("id", eventId)
      .lte("date_start", fim)
      .gte("date_end", dateStart);
    setTrocando(false);
    if (erroLer) return avisar("Não consegui conferir a agenda do outro HIPRO. Confira a internet.", "erro");
    const lista = (ocupantes ?? []) as unknown as { id: string; title: string; date_start: string; date_end: string | null; clients: { name: string } | null }[];
    const nome = (o: (typeof lista)[number]) => o.clients?.name || o.title;
    const quando = (o: (typeof lista)[number]) =>
      o.date_end && o.date_end > o.date_start ? `de ${formatDate(o.date_start)} a ${formatDate(o.date_end)}` : `em ${formatDate(o.date_start)}`;

    if (lista.length > 1) {
      return avisar(
        `O ${para} está com ${lista.length} atendimentos nesse período (${lista.map(nome).join(", ")}). Troque um de cada vez, a partir de cada atendimento.`,
        "erro"
      );
    }
    const com = lista[0] ?? null;
    const ok = await confirmar(
      com
        ? {
            titulo: `Trocar os dois de HIPRO?`,
            texto: `O ${para} está com ${nome(com)} ${quando(com)}. Os dois trocam de aparelho: este atendimento vai para o ${para} e ${nome(com)} vai para o ${de}. As datas não mudam.`,
            confirmar: "Trocar os dois",
          }
        : {
            titulo: `Passar para o ${para}?`,
            texto: `Este atendimento sai do ${de} e vai para o ${para}, na mesma data. O ${para} está livre nesse período.`,
            confirmar: `Passar para o ${para}`,
          }
    );
    if (!ok) return;
    setTrocando(true);
    const { error } = await supabase.rpc("trocar_hipro_agendamento", { p_event_id: eventId, ...(com ? { p_trocar_com: com.id } : {}) });
    setTrocando(false);
    if (error) {
      // PGRST202: a função ainda não existe no banco (SQL não rodado).
      const semSql = error.code === "PGRST202";
      return avisar(semSql ? "Falta rodar o SQL da troca de HIPRO." : error.message || "Não consegui trocar o HIPRO.", "erro");
    }
    avisar(com ? `Pronto: trocados. Este atendimento está no ${para} e ${nome(com)} no ${de}.` : `Pronto: agora está no ${para}.`);
    onTrocado();
  }

  return (
    <button
      type="button"
      onClick={trocar}
      disabled={trocando}
      className={`flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-700 disabled:opacity-60 ${className}`}
    >
      <ArrowLeftRight size={15} /> {trocando ? "Trocando..." : `Passar para o ${para}`}
    </button>
  );
}
