"use client";

// Revisão anual do HIPRO: mostra a última e a próxima (última + 1 ano) e
// registra a revisão feita (registrar_revisao_equipamento).

import { useState } from "react";
import { useRouter } from "next/navigation";
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
        : "text-neutral-500";

  return (
    <div>
      {r.proxima ? (
        <>
          <p className="mt-0.5 text-sm font-medium text-neutral-900">Próxima: {formatDate(r.proxima)}</p>
          <p className={`text-xs ${cor}`}>
            {r.situacao === "vencida"
              ? `Vencida há ${-r.dias!} ${r.dias === -1 ? "dia" : "dias"}`
              : r.dias === 0
                ? "É hoje"
                : `Faltam ${r.dias} ${r.dias === 1 ? "dia" : "dias"}`}
            {" · "}última em {formatDate(ultimaRevisao as string)}
          </p>
          {(r.situacao === "perto" || r.situacao === "vencida") && (
            <p className="mt-0.5 text-[11px] text-neutral-500">Marque o dia e trave a agenda em &quot;Bloquear período&quot; (Manutenção).</p>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-xs text-neutral-400">Data da última revisão não informada.</p>
      )}

      {aberto ? (
        <div className="mt-2 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-0.5 block text-[10px] text-neutral-500">Dia em que a revisão foi feita</label>
            <input
              type="date"
              value={data}
              max={hoje}
              onChange={(e) => setData(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
            />
          </div>
          <button
            type="button"
            disabled={salvando}
            onClick={salvar}
            className="rounded-lg bg-brand-teal px-3 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
          >
            Salvar
          </button>
          <button type="button" onClick={() => setAberto(false)} className="text-[11px] text-neutral-500 underline">
            voltar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setData(hoje);
            setErro(null);
            setAberto(true);
          }}
          className="mt-1 text-[11px] font-medium text-brand-teal"
        >
          {ultimaRevisao ? "Registrar revisão feita" : "Informar última revisão"}
        </button>
      )}
      {erro && <p className="mt-1 text-[11px] text-red-600">{erro}</p>}
    </div>
  );
}
