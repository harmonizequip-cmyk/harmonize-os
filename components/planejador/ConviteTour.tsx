"use client";

// Convite do tour na primeira vez que a cliente abre o portal (uma vez por aparelho).
// Depois, o tour fica no botão "Como usar" do topo.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass } from "lucide-react";
import { CHAVE_TOUR_VISTO, ENDERECO_TOUR, tourJaVisto } from "@/lib/tour-planejador";

export default function ConviteTour() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    setAberto(!tourJaVisto((k) => localStorage.getItem(k)));
  }, []);

  function marcar() {
    try {
      localStorage.setItem(CHAVE_TOUR_VISTO, new Date().toISOString());
    } catch {
      // sem armazenamento: o convite volta na próxima vez
    }
    setAberto(false);
  }

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(15,30,35,0.55)] p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Conhecer o Planejador">
      <div className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl animate-[aparecer_.25s_ease-out]">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-teal/10 text-brand-teal-dark">
          <Compass size={24} />
        </span>
        <p className="mt-3 text-lg font-extrabold text-neutral-900">Primeira vez no Planejador?</p>
        <p className="mt-1 text-[15px] leading-relaxed text-neutral-600">
          Em 2 minutos mostramos cada botão, montando o plano de uma paciente de exemplo. Nada do que você fizer no exemplo fica salvo.
        </p>
        <button
          onClick={() => {
            marcar();
            router.push(ENDERECO_TOUR);
          }}
          className="mt-4 min-h-12 w-full rounded-2xl bg-brand-teal text-sm font-bold text-white"
        >
          Começar o tour
        </button>
        <button onClick={marcar} className="mt-2 min-h-11 w-full rounded-2xl text-sm font-semibold text-neutral-600">
          Agora não (fica em &quot;Como usar&quot;, no topo)
        </button>
      </div>
    </div>
  );
}
