"use client";

// Revisão anual do HIPRO: mostra a última e a próxima (última + 1 ano) e
// registra a revisão feita (registrar_revisao_equipamento).

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, History } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { situacaoRevisao } from "@/lib/revisao";

export default function RevisaoAnualControl({ equipmentId, ultimaRevisao }: { equipmentId: string; ultimaRevisao: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const hoje = hojeLocal();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const r = situacaoRevisao(ultimaRevisao, hoje);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_revisao_equipamento", { p_equipment_id: equipmentId, p_data: data });
    setSalvando(false);
    if (error) return setErro(error.message || "Não consegui salvar. Tente de novo.");
    setAberto(false);
    router.refresh();
  }

  const cor =
    r.situacao === "vencida"
      ? "font-semibold text-red-600"
      : r.situacao === "perto"
        ? "font-semibold text-amber-600"
        : "text-slate-500";

  const textoPrincipal = r.proxima
    ? r.situacao === "vencida"
      ? `Vencida há ${-r.dias!} ${r.dias === -1 ? "dia" : "dias"} · última em ${formatDate(ultimaRevisao as string)}`
      : r.dias === 0
        ? `É hoje · última em ${formatDate(ultimaRevisao as string)}`
        : `Próxima: ${formatDate(r.proxima)} · faltam ${r.dias} ${r.dias === 1 ? "dia" : "dias"}`
    : "Data da última revisão não informada.";

  return (
    <div className="rounded-3xl bg-teal-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <History size={28} strokeWidth={1.7} className="flex-shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-900">Revisão anual</p>
          <p className={`text-[13px] leading-snug ${cor}`}>{textoPrincipal}</p>
        </div>
        {!aberto && (
          <button
            type="button"
            onClick={() => {
              setData(hoje);
              setErro(null);
              setAberto(true);
            }}
            className="flex w-full flex-shrink-0 items-center justify-end gap-0.5 text-[13.5px] font-semibold leading-tight text-teal-700 min-[430px]:w-auto"
          >
            <span className="min-[430px]:max-w-[7.5rem] min-[430px]:text-right">{ultimaRevisao ? "Registrar revisão feita" : "Informar última revisão"}</span>
            <ChevronRight size={18} />
          </button>
        )}
      </div>
      {(r.situacao === "perto" || r.situacao === "vencida") && (
        <p className="mt-1.5 text-[12px] text-slate-500">Marque o dia e trave a agenda em &quot;Bloquear período&quot; (Manutenção).</p>
      )}
      {aberto && (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Dia em que a revisão foi feita</label>
            <input
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => setData(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm"
            />
          </div>
          <button type="button" disabled={salvando} onClick={salvar} className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            Salvar
          </button>
          <button type="button" onClick={() => setAberto(false)} className="px-1 text-xs text-slate-500 underline">
            voltar
          </button>
        </div>
      )}
      {erro && <p className="mt-1.5 text-[12px] text-red-600">{erro}</p>}
    </div>
  );
}
