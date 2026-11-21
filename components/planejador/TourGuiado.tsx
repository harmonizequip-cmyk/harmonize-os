"use client";

// Tour guiado do Planejador: escurece a tela, recorta o elemento do passo
// (data-tour="...") e mostra um balão com Voltar, Próximo e Pular. Durante o
// tour a tela de trás não recebe toques; depois a cliente mexe à vontade.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { AbaTour, PassoTour, VisaoResumoTour } from "@/lib/tour-planejador";

type Caixa = { top: number; left: number; width: number; height: number };

const MARGEM = 8;

export default function TourGuiado({
  passos,
  onAba,
  onVisao,
  onFim,
}: {
  /** Abre a visão do Resumo que o passo mostra. */
  onVisao?: (v: VisaoResumoTour) => void;
  passos: PassoTour[];
  /** Abre a aba que o passo precisa. */
  onAba: (a: AbaTour) => void;
  onFim: () => void;
}) {
  const [i, setI] = useState(0);
  const [caixa, setCaixa] = useState<Caixa | null>(null);
  const [tela, setTela] = useState({ w: 0, h: 0 });
  const passo = passos[i];
  // Só depois de montar no navegador (o servidor não tem document: sem isso a hidratação diverge).
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const medir = useCallback(() => {
    setTela({ w: window.innerWidth, h: window.innerHeight });
    if (!passo?.alvo) return setCaixa(null);
    const el = document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`);
    if (!el) return setCaixa(null);
    const r = el.getBoundingClientRect();
    setCaixa({ top: r.top - MARGEM, left: r.left - MARGEM, width: r.width + MARGEM * 2, height: r.height + MARGEM * 2 });
  }, [passo]);

  // Troca de passo: abre a aba, espera a tela desenhar, rola até o alvo e mede.
  useEffect(() => {
    if (!passo) return;
    if (passo.aba) onAba(passo.aba);
    if (passo.visao) onVisao?.(passo.visao);
    setCaixa(null);
    const t1 = setTimeout(() => {
      const el = passo.alvo ? document.querySelector<HTMLElement>(`[data-tour="${passo.alvo}"]`) : null;
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 120);
    const t2 = setTimeout(medir, 520);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [passo, onAba, onVisao, medir]);

  useLayoutEffect(() => {
    window.addEventListener("resize", medir);
    window.addEventListener("scroll", medir, true);
    return () => {
      window.removeEventListener("resize", medir);
      window.removeEventListener("scroll", medir, true);
    };
  }, [medir]);

  if (!passo || !montado) return null;
  const ultimo = i === passos.length - 1;

  // Balão embaixo do destaque quando cabe; senão em cima; sem destaque, no meio.
  const largura = Math.min(360, (tela.w || 360) - 24);
  let estiloBalao: React.CSSProperties = { left: "50%", top: "50%", transform: "translate(-50%, -50%)", width: largura };
  if (caixa && tela.h) {
    const esquerda = Math.max(12, Math.min(caixa.left + caixa.width / 2 - largura / 2, tela.w - largura - 12));
    const espacoAbaixo = tela.h - (caixa.top + caixa.height);
    estiloBalao =
      espacoAbaixo > 230 || espacoAbaixo > caixa.top
        ? { left: esquerda, top: Math.min(caixa.top + caixa.height + 12, tela.h - 220), width: largura }
        : { left: esquerda, bottom: Math.min(tela.h - caixa.top + 12, tela.h - 220), width: largura };
  }

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={passo.titulo}>
      {/* Bloqueia os toques na tela de trás durante o tour. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {caixa ? (
        <div
          className="pointer-events-none absolute rounded-2xl ring-4 ring-brand-teal transition-all duration-300 ease-out"
          style={{ ...caixa, boxShadow: "0 0 0 9999px rgba(15, 30, 35, 0.62)" }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-[rgba(15,30,35,0.62)]" />
      )}
      <div className="absolute rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-neutral-200 animate-[aparecer_.2s_ease-out]" style={estiloBalao}>
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-base font-extrabold leading-snug text-neutral-900">{passo.titulo}</p>
          {!ultimo && (
            <button onClick={onFim} aria-label="Pular o tour" className="-mr-1 -mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 active:bg-neutral-100">
              <X size={18} />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-700">{passo.texto}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-neutral-500 tabular-nums">
            {i + 1} de {passos.length}
          </span>
          <span className="flex-1" />
          {i > 0 && (
            <button onClick={() => setI(i - 1)} className="min-h-11 rounded-xl px-4 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200">
              Voltar
            </button>
          )}
          <button onClick={() => (ultimo ? onFim() : setI(i + 1))} className="min-h-11 rounded-xl bg-brand-teal px-5 text-sm font-bold text-white">
            {ultimo ? "Começar a mexer" : i === 0 ? "Começar" : "Próximo"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
