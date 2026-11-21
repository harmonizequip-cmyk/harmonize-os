"use client";

// Dica curta que aparece até a cliente tocar em "Entendi" (guardado no aparelho).

import { useEffect, useState } from "react";
import { Lightbulb } from "lucide-react";

export default function DicaUmaVez({ id, children }: { id: string; children: React.ReactNode }) {
  const chave = `harmonize-dica-${id}`;
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    try {
      setMostrar(!localStorage.getItem(chave));
    } catch {
      setMostrar(false);
    }
  }, [chave]);

  if (!mostrar) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-2xl bg-sky-50 px-3 py-2.5 text-[13px] leading-snug text-sky-900 ring-1 ring-sky-200">
      <Lightbulb size={16} className="mt-0.5 flex-shrink-0 text-sky-600" />
      <span className="min-w-0 flex-1">{children}</span>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(chave, "1");
          } catch {
            // sem armazenamento: some só nesta tela
          }
          setMostrar(false);
        }}
        className="flex-shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-sky-800 ring-1 ring-sky-300"
      >
        Entendi
      </button>
    </div>
  );
}
