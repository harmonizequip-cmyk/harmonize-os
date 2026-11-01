"use client";

// Guia resumido de cuidados com o HIPRO (e-book do HIPRO, capítulo 26).
// Abre por portal no <body>, porque pode ser chamado de dentro de janelas
// com backdrop-filter (reserva na Agenda).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, Droplets, Hand, Plug, ShieldAlert, Sparkles, Truck, Waves, X, type LucideIcon } from "lucide-react";
import { IconeChip, type CorVisual } from "@/components/ui/Visual";
import { GUIA_CUIDADOS, type SecaoCuidados } from "@/lib/manutencao-equipamento";

const ICONES: Record<SecaoCuidados["id"], { icone: LucideIcon; cor: CorVisual }> = {
  agua: { icone: Droplets, cor: "azul" },
  bolhas: { icone: Waves, cor: "teal" },
  limpeza: { icone: Sparkles, cor: "verde" },
  mangueira: { icone: Hand, cor: "roxo" },
  transporte: { icone: Truck, cor: "ambar" },
  energia: { icone: Plug, cor: "cinza" },
};

export default function CuidadosHiproModal({ onClose }: { onClose: () => void }) {
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    setMontado(true);
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [onClose]);
  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cuidados-hipro-titulo"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <IconeChip icone={ShieldAlert} cor="teal" />
          <h2 id="cuidados-hipro-titulo" className="min-w-0 flex-1 text-lg font-extrabold text-slate-900">
            Cuidados com o HIPRO
          </h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          {GUIA_CUIDADOS.map((s) => {
            const v = ICONES[s.id];
            return (
              <section key={s.id} className="rounded-3xl border border-slate-100 bg-slate-50/60 p-3.5">
                <div className="flex items-center gap-2">
                  <IconeChip icone={v.icone} cor={v.cor} tamanho="sm" />
                  <h3 className="text-[15px] font-bold text-slate-900">{s.titulo}</h3>
                </div>
                <ul className="mt-2 space-y-1 pl-1 text-[13.5px] leading-snug text-slate-700">
                  {s.itens.map((i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-teal-500" />
                      <span>{i}</span>
                    </li>
                  ))}
                </ul>
                {s.nunca && (
                  <p className="mt-2 flex gap-2 rounded-2xl bg-rose-50 px-3 py-2 text-[13px] font-semibold leading-snug text-rose-700">
                    <Ban size={16} className="mt-0.5 flex-shrink-0" />
                    <span>Nunca: {s.nunca}</span>
                  </p>
                )}
              </section>
            );
          })}
        </div>

        <p className="mt-4 text-[11.5px] text-slate-400">Resumo do e-book do HIPRO, capítulo 26 (manutenção e cuidados operacionais).</p>
        <button type="button" onClick={onClose} className="mt-3 w-full rounded-2xl bg-teal-500 py-2.5 text-sm font-bold text-white">
          Entendi
        </button>
      </div>
    </div>,
    document.body
  );
}
