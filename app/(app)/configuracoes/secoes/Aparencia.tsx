"use client";

// Aparência: escolher entre os temas Clássico, Aurora e HIPRO vendo como fica.
// Mesma chave do botão de paleta do topo (localStorage harmonize-tema, lib/tema.ts).

import { Check } from "lucide-react";
import { TEMAS, useTema, type Tema } from "@/lib/tema";
import { Bloco } from "../ui";

function Miniatura({ tema }: { tema: Tema }) {
  if (tema === "hipro") {
    return (
      <div
        className="relative h-36 overflow-hidden rounded-2xl"
        style={{ background: "radial-gradient(90% 70% at 50% 45%, #0a4658 0%, #01283a 60%, #001c27 100%)" }}
      >
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {[0, 3, 6, 9].map((d) => (
            <path key={d} d={`M-5 ${30 + d} C 20 ${10 + d}, 35 ${-5 + d}, 60 -5`} fill="none" stroke="#51d3da" strokeOpacity={0.5 - d * 0.04} strokeWidth="0.5" />
          ))}
          {[0, 3, 6, 9].map((d) => (
            <path key={`b${d}`} d={`M40 105 C 65 ${92 - d}, 80 ${80 - d}, 105 ${62 - d}`} fill="none" stroke="#51d3da" strokeOpacity={0.5 - d * 0.04} strokeWidth="0.5" />
          ))}
        </svg>
        <div className="relative space-y-1.5 p-2.5">
          <div className="h-2 w-14 rounded-full bg-[#e6f6f8]/80" />
          <div className="flex h-9 items-center justify-end rounded-xl border border-[#51d3da]/30 bg-[#06303d]/80 pr-1">
            <img src="/hipro/aparelho-600.webp" alt="" className="h-8 w-auto" />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div className="h-7 rounded-lg border border-[#51d3da]/25 bg-[#06303d]/80" />
            <div className="h-7 rounded-lg border border-[#51d3da]/25 bg-[#06303d]/80" />
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 flex h-6 items-center justify-around border-t border-[#51d3da]/25 bg-[#00222e]/90">
          <span className="h-3 w-6 rounded-full bg-[#51d3da]/30 shadow-[0_0_8px_#51d3da]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#7f9faa]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#7f9faa]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#7f9faa]" />
        </div>
      </div>
    );
  }
  const aurora = tema === "aurora";
  return (
    <div
      className="relative h-36 overflow-hidden rounded-2xl"
      style={{
        background: aurora
          ? "radial-gradient(120% 60% at 50% -10%, rgba(61,191,184,.35), transparent 60%), #F1F4F8"
          : "#FAFAFA",
      }}
    >
      <div className="space-y-1.5 p-2.5">
        <div className="h-2 w-14 rounded-full bg-[#1e293b]/70" />
        <div className={`h-9 rounded-xl ${aurora ? "bg-[#fff] shadow-md" : "border border-[#e2e8f0] bg-[#fff]"}`} />
        <div className="grid grid-cols-2 gap-1.5">
          <div className={`h-7 rounded-lg ${aurora ? "bg-[#fff] shadow-md" : "border border-[#e2e8f0] bg-[#fff]"}`} />
          <div className={`h-7 rounded-lg ${aurora ? "bg-[#fff] shadow-md" : "border border-[#e2e8f0] bg-[#fff]"}`} />
        </div>
      </div>
      <div
        className={`absolute bottom-2 flex h-6 items-center justify-around ${
          aurora ? "left-3 right-3 rounded-full bg-[#fff] shadow-lg" : "left-0 right-0 border-t border-[#e2e8f0] bg-[#fff]/90"
        }`}
      >
        <span className={`h-3 w-6 rounded-full ${aurora ? "bg-brand-gradient" : "bg-brand-teal/70"}`} />
        <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
        <span className="h-1.5 w-1.5 rounded-full bg-[#cbd5e1]" />
      </div>
    </div>
  );
}

export default function Aparencia() {
  const [tema, escolher] = useTema();

  return (
    <Bloco titulo="Tema" dica="Vale só para este aparelho. O botão de paleta no topo também troca. No Pessoal fica sempre o violeta.">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {TEMAS.map((o) => {
          const ativo = tema === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => escolher(o.id)}
              aria-pressed={ativo}
              className={`rounded-3xl p-2 text-left ring-2 transition ${ativo ? "bg-brand-teal/5 ring-brand-teal" : "bg-white ring-neutral-200"}`}
            >
              <Miniatura tema={o.id} />
              <span className="mt-2 flex items-center justify-between px-1">
                <span className="text-sm font-bold text-neutral-900">{o.nome}</span>
                {ativo && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-teal text-white">
                    <Check size={12} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="block px-1 pb-1 text-[11px] leading-snug text-neutral-500">{o.dica}</span>
            </button>
          );
        })}
      </div>
    </Bloco>
  );
}
