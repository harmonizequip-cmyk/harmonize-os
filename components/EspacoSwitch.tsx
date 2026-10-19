"use client";

// Chave do topo: Harmonize (o negócio) ou Pessoal (o dinheiro do dono). O
// menu muda junto (Sidebar e BottomNav leem o mesmo endereço). A chave muda
// na hora do toque e mostra "abrindo..." enquanto a tela carrega (o
// Dashboard da Harmonize leva alguns segundos e, sem isso, o toque parecia
// não ter feito nada).

import { useEffect, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";

export default function EspacoSwitch() {
  const pathname = usePathname();
  const router = useRouter();
  const pessoalAgora = ehEspacoPessoal(pathname);
  const [destino, setDestino] = useState<"harmonize" | "pessoal" | null>(null);
  const [carregando, iniciar] = useTransition();

  // Chegou na tela: volta a seguir o endereço.
  useEffect(() => setDestino(null), [pathname]);

  const pessoal = destino ? destino === "pessoal" : pessoalAgora;

  function ir(para: "harmonize" | "pessoal") {
    if ((para === "pessoal") === pessoalAgora) return;
    setDestino(para);
    iniciar(() => router.push(para === "pessoal" ? "/pessoal" : "/dashboard"));
  }

  const estilo = (ativo: boolean, pessoalBotao = false) =>
    `flex-1 rounded-xl py-2 text-center text-sm font-bold transition ${
      ativo
        ? pessoalBotao
          ? "bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white shadow-[0_8px_18px_-8px_rgb(124_58_237/0.8)]"
          : "bg-gradient-to-r from-teal-600 to-emerald-500 text-white shadow-[0_8px_18px_-8px_rgb(13_148_136/0.8)]"
        : "text-slate-500"
    }`;
  return (
    // Fica preso no topo ao rolar (pedido do dono, 19/10/2026): dá para trocar de espaço a qualquer hora.
    // z-10 de propósito: as janelas (z-20 em diante) continuam por cima.
    <div className="barra-espaco sticky top-0 z-10 -mx-4 mb-3 px-4 py-2 backdrop-blur-md md:-mx-8 md:px-8">
      <div className={`flex rounded-2xl p-1 ${pessoal ? "bg-violet-100/80" : "bg-teal-100/70"}`}>
        <button type="button" onClick={() => ir("harmonize")} className={estilo(!pessoal)}>
          Harmonize
        </button>
        <button type="button" onClick={() => ir("pessoal")} className={estilo(pessoal, true)}>
          Pessoal
        </button>
      </div>
      {(carregando || destino) && (
        <p className="mt-1 animate-pulse text-center text-[11px] text-neutral-500">
          Abrindo {destino === "pessoal" ? "o Pessoal" : "a Harmonize"}...
        </p>
      )}
    </div>
  );
}
