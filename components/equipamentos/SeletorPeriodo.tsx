"use client";

// Seletor de período em forma de pílula ("Este mês ⌄"), do desenho aprovado
// da tela de Equipamentos. Mesmo contrato do FiltroBarra: o período vive na
// URL (period, from, to) e o servidor consulta já filtrado.

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { OPCOES_PERIODO } from "@/lib/period";

export default function SeletorPeriodo({ padrao = "mes" }: { padrao?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const atual = searchParams.get("period") ?? (searchParams.get("from") ? "personalizado" : padrao);
  const [de, setDe] = useState(searchParams.get("from") ?? "");
  const [ate, setAte] = useState(searchParams.get("to") ?? "");
  const raiz = useRef<HTMLDivElement>(null);
  const rotulo = OPCOES_PERIODO.find((o) => o.chave === atual)?.label ?? "Este mês";

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  function ir(chave: string, extra: Record<string, string> = {}) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", chave);
    params.delete("from");
    params.delete("to");
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex items-center gap-1 whitespace-nowrap rounded-2xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-700 active:bg-teal-100"
      >
        {rotulo}
        <ChevronDown size={17} strokeWidth={2.4} className={`transition ${aberto ? "rotate-180" : ""}`} />
      </button>

      {aberto && (
        <div className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-3xl bg-white p-1.5 shadow-[0_18px_40px_-12px_rgb(15_23_42/0.35)] ring-1 ring-slate-200/80">
          {OPCOES_PERIODO.filter((o) => o.chave !== "personalizado").map((o) => (
            <button
              key={o.chave}
              type="button"
              onClick={() => {
                setAberto(false);
                ir(o.chave);
              }}
              className="flex w-full items-center justify-between rounded-2xl px-3.5 py-2.5 text-left text-sm font-medium text-slate-700 active:bg-slate-50"
            >
              {o.label}
              {atual === o.chave && <Check size={16} className="text-teal-600" />}
            </button>
          ))}
          <div className="mt-1 border-t border-slate-100 p-2.5">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">Período personalizado</p>
            <div className="grid grid-cols-2 gap-1.5">
              <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" />
              <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded-xl border border-slate-200 px-2 py-1.5 text-xs" />
            </div>
            <button
              type="button"
              disabled={!de || !ate}
              onClick={() => {
                setAberto(false);
                ir("personalizado", { from: de, to: ate });
              }}
              className="mt-2 w-full rounded-xl bg-teal-500 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
