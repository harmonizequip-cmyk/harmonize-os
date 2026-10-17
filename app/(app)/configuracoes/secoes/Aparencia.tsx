"use client";

// Aparência: escolher entre o tema Clássico e o Aurora vendo como fica.
// Mesma chave do botão de paleta do topo (localStorage harmonize-tema).

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { CHAVE_TEMA } from "@/components/ThemeToggle";
import { Bloco } from "../ui";

type Tema = "classico" | "aurora";

function Miniatura({ tema }: { tema: Tema }) {
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
        <div className="h-2 w-14 rounded-full bg-neutral-800/70" />
        <div className={`h-9 rounded-xl ${aurora ? "bg-white shadow-md" : "border border-white/60 bg-white/80"}`} />
        <div className="grid grid-cols-2 gap-1.5">
          <div className={`h-7 rounded-lg ${aurora ? "bg-white shadow-md" : "border border-neutral-200 bg-white"}`} />
          <div className={`h-7 rounded-lg ${aurora ? "bg-white shadow-md" : "border border-neutral-200 bg-white"}`} />
        </div>
      </div>
      <div
        className={`absolute bottom-2 flex h-6 items-center justify-around ${
          aurora ? "left-3 right-3 rounded-full bg-white shadow-lg" : "left-0 right-0 border-t border-neutral-200 bg-white/90"
        }`}
      >
        <span className={`h-3 w-6 rounded-full ${aurora ? "bg-brand-gradient" : "bg-brand-teal/70"}`} />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
      </div>
    </div>
  );
}

export default function Aparencia() {
  const [tema, setTema] = useState<Tema>("classico");

  useEffect(() => {
    setTema(document.documentElement.classList.contains("tema-aurora") ? "aurora" : "classico");
  }, []);

  function escolher(t: Tema) {
    setTema(t);
    document.documentElement.classList.toggle("tema-aurora", t === "aurora");
    try {
      localStorage.setItem(CHAVE_TEMA, t);
    } catch {
      // sem armazenamento: vale até fechar o app
    }
  }

  const opcoes: { id: Tema; nome: string; dica: string }[] = [
    { id: "classico", nome: "Clássico", dica: "Vidro claro, o de sempre" },
    { id: "aurora", nome: "Aurora", dica: "Brilho da marca e barra flutuante" },
  ];

  return (
    <Bloco titulo="Tema" dica="Vale só para este aparelho. O botão de paleta no topo também troca.">
      <div className="grid grid-cols-2 gap-3">
        {opcoes.map((o) => {
          const ativo = tema === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => escolher(o.id)}
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
