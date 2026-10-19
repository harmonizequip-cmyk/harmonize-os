"use client";

// Aba Resumo: números do plano, alertas, distribuição por área (barras com a
// modelo de cada área) e prévia do texto, do prontuário e da ficha do paciente.

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { alertas, situacaoSaldo, textoResumo, todasAreas, totalArea, type Plano } from "@/lib/planejador";
import { CSS_PRONTUARIO, htmlFichaPaciente, htmlProntuario, imagemDaArea } from "@/lib/planejador-impressao";
import { fmt } from "./Partes";

type Modo = "lista" | "prontuario" | "paciente";

export default function ResumoPlano({ plano, onIrParaArea }: { plano: Plano; onIrParaArea: (id: string) => void }) {
  const [modo, setModo] = useState<Modo>("lista");
  const s = situacaoSaldo(plano);
  const avisos = alertas(plano);
  const areas = todasAreas(plano)
    .map((a) => ({ a, t: totalArea(plano, a) }))
    .filter((x) => x.t > 0)
    .sort((x, y) => y.t - x.t);
  const maior = areas[0]?.t ?? 1;
  const previa = useMemo(() => {
    if (modo === "lista") return "";
    const origem = typeof window !== "undefined" ? window.location.origin : "";
    return modo === "prontuario" ? htmlProntuario(plano, origem) : htmlFichaPaciente(plano, origem);
  }, [modo, plano]);

  const numero = (rotulo: string, valor: string, destaque = "") => (
    <div className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{rotulo}</p>
      <p className={`mt-0.5 text-xl font-extrabold tabular-nums ${destaque || "text-neutral-900"}`}>{valor}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {numero(plano.sessoesTotal > 1 ? "Pacote" : "Saldo", fmt(s.saldo))}
        {numero(plano.sessoesTotal > 1 ? `Nesta sessão (${plano.sessaoAtual}/${plano.sessoesTotal})` : "Distribuído", fmt(s.total), "text-brand-teal-dark")}
        {numero(
          plano.sessoesTotal > 1 && plano.sessaoAtual < plano.sessoesTotal ? `Fica para a sessão ${plano.sessaoAtual + 1}` : "Restante",
          fmt(plano.sessoesTotal > 1 && plano.sessaoAtual < plano.sessoesTotal ? s.paraProximas : s.resta),
          s.resta < 0 ? "text-rose-600" : ""
        )}
        {numero("Áreas", String(areas.length))}
      </div>

      <div className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Alertas do protocolo</p>
        {avisos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle2 size={16} /> Tudo dentro do protocolo.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {avisos.map((x, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => x.areaId && onIrParaArea(x.areaId)}
                  className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm ${x.grave ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-800"}`}
                >
                  <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
                  <span>{x.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {areas.length > 0 && (
        <div className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Distribuição por área</p>
          <ul className="space-y-2.5">
            {areas.map(({ a, t }) => (
              <li key={a.id}>
                <button type="button" onClick={() => onIrParaArea(a.id)} className="flex w-full items-center gap-3 text-left">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imagemDaArea(a)} alt="" className="h-9 w-9 flex-shrink-0 rounded-xl" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-neutral-800">{a.nome}</span>
                      <span className="text-sm font-bold tabular-nums text-neutral-900">
                        {fmt(t)}
                        {s.saldo > 0 && <span className="ml-1 text-[11px] font-medium text-neutral-400">{Math.round((t / s.saldo) * 100)}%</span>}
                      </span>
                    </span>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-neutral-100">
                      <span className="block h-full rounded-full bg-brand-gradient transition-all duration-500" style={{ width: `${Math.max(4, (t / maior) * 100)}%` }} />
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-3xl bg-white p-2 ring-1 ring-neutral-200/80">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
          {(
            [
              ["lista", "Texto"],
              ["prontuario", "Prontuário"],
              ["paciente", "Ficha paciente"],
            ] as [Modo, string][]
          ).map(([m, r]) => (
            <button key={m} type="button" onClick={() => setModo(m)} className={`rounded-xl py-2 text-xs font-bold transition ${modo === m ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}>
              {r}
            </button>
          ))}
        </div>
        <div className="mt-2 overflow-x-auto rounded-2xl">
          {modo === "lista" ? (
            <pre className="whitespace-pre-wrap break-words bg-neutral-50 p-3 font-mono text-[11.5px] leading-relaxed text-neutral-700">{textoResumo(plano)}</pre>
          ) : (
            <div className="min-w-[560px] bg-white p-3">
              <style>{CSS_PRONTUARIO}</style>
              <div dangerouslySetInnerHTML={{ __html: previa }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
