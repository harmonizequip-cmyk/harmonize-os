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

  const estilo = (ativo: boolean) =>
    `flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition ${
      ativo ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
    }`;
  return (
    <div className="mb-4">
      <div className="flex rounded-xl bg-neutral-200/70 p-1">
        <button type="button" onClick={() => ir("harmonize")} className={estilo(!pessoal)}>
          Harmonize
        </button>
        <button type="button" onClick={() => ir("pessoal")} className={estilo(pessoal)}>
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
