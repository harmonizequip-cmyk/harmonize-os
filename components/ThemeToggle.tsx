"use client";

// Escolha do tema: Clássico (padrão), Aurora ou HIPRO (escuro, inspirado na
// capa do e-book). O botão de paleta abre uma lista com os três e marca o que
// está ativo. A escolha fica guardada no aparelho (lib/tema.ts); o script do
// app/layout.tsx aplica antes da tela aparecer, sem piscar.

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Check, Palette } from "lucide-react";
import { TEMAS, nomeDoTema, useTema } from "@/lib/tema";
import { ehEspacoPessoal } from "@/lib/espaco";

export { CHAVE_TEMA } from "@/lib/tema";

export default function ThemeToggle({
  className = "",
  compact = false,
  posicao = "baixo",
}: {
  className?: string;
  compact?: boolean;
  /** "baixo": lista abre embaixo do botão (topo do celular); "cima": abre acima (pé da barra lateral); "ciclar": cada toque passa para o próximo tema (barra lateral recolhida, sem espaço para a lista). */
  posicao?: "baixo" | "cima" | "ciclar";
}) {
  const [tema, escolher] = useTema();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const pessoal = ehEspacoPessoal(usePathname());

  useEffect(() => {
    if (!aberto) return;
    function fora(e: PointerEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const rotulo = `Tema: ${nomeDoTema(tema)}`;

  return (
    <div ref={caixa} className={`relative ${compact ? "" : "w-full"}`}>
      {compact ? (
        <button
          type="button"
          onClick={() => {
            if (posicao === "ciclar") {
              const i = TEMAS.findIndex((t) => t.id === tema);
              escolher(TEMAS[(i + 1) % TEMAS.length].id);
              return;
            }
            setAberto((v) => !v);
          }}
          aria-label={`${rotulo}. Trocar tema`}
          aria-haspopup="menu"
          aria-expanded={aberto}
          title={rotulo}
          className={`flex items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 ${className}`}
        >
          <Palette size={18} strokeWidth={1.75} />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={aberto}
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 ${className}`}
        >
          <Palette size={17} strokeWidth={1.75} className="text-neutral-400" />
          <span>{rotulo}</span>
        </button>
      )}

      {aberto && (
        <div
          role="menu"
          aria-label="Escolher tema"
          className={`absolute z-50 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl ${
            posicao === "cima" ? "bottom-full left-0 right-0 mb-2" : "right-0 top-full mt-2 w-60"
          }`}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">Tema deste aparelho</p>
          {TEMAS.map((t) => {
            const ativo = t.id === tema;
            return (
              <button
                key={t.id}
                type="button"
                role="menuitemradio"
                aria-checked={ativo}
                onClick={() => {
                  escolher(t.id);
                  setAberto(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${
                  ativo ? "bg-teal-50 text-teal-700" : "text-neutral-700 hover:bg-neutral-100"
                }`}
              >
                <span
                  aria-hidden
                  className="h-7 w-7 flex-shrink-0 rounded-lg border border-neutral-200"
                  style={{
                    background:
                      t.id === "hipro"
                        ? "radial-gradient(circle at 50% 40%, #0a4a5c, #002431 75%)"
                        : t.id === "aurora"
                          ? "radial-gradient(120% 70% at 50% -10%, rgba(61,191,184,.55), transparent 65%), #F1F4F8"
                          : "#FAFAFA",
                  }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{t.nome}</span>
                  <span className="block text-[11px] leading-snug text-neutral-500">{t.dica}</span>
                </span>
                {ativo && <Check size={16} strokeWidth={2.6} className="flex-shrink-0" />}
              </button>
            );
          })}
          {pessoal && tema === "hipro" && (
            <p className="px-2.5 pb-1.5 pt-1 text-[11px] leading-snug text-neutral-500">No Pessoal fica o violeta de sempre; o HIPRO vale na Harmonize.</p>
          )}
        </div>
      )}
    </div>
  );
}
