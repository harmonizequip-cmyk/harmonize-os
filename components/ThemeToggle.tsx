"use client";

// Troca entre o tema Clássico (padrão) e o Suave (cinzas lilás e fundo
// pastel da marca). A escolha fica guardada no aparelho; o script do
// app/layout.tsx aplica antes da tela aparecer, sem piscar.

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";

export const CHAVE_TEMA = "harmonize-tema";

export default function ThemeToggle({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [suave, setSuave] = useState(false);

  useEffect(() => {
    setSuave(document.documentElement.classList.contains("tema-suave"));
  }, []);

  function toggle() {
    const next = !suave;
    setSuave(next);
    document.documentElement.classList.toggle("tema-suave", next);
    try {
      localStorage.setItem(CHAVE_TEMA, next ? "suave" : "classico");
    } catch {
      // localStorage indisponível, segue sem persistir
    }
  }

  const rotulo = suave ? "Tema Clássico" : "Tema Suave";

  if (compact) {
    return (
      <button
        onClick={toggle}
        aria-label={`Trocar para ${rotulo}`}
        title={`Trocar para ${rotulo}`}
        className={`flex items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 ${className}`}
      >
        <Palette size={18} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Trocar para ${rotulo}`}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 ${className}`}
    >
      <Palette size={17} strokeWidth={1.75} className="text-neutral-400" />
      <span>{rotulo}</span>
    </button>
  );
}
