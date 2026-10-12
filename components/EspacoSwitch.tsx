"use client";

// Chave do topo: Harmonize (o negócio) ou Pessoal (o dinheiro do dono). O
// menu muda junto (Sidebar e BottomNav leem o mesmo endereço).

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";

export default function EspacoSwitch() {
  const pessoal = ehEspacoPessoal(usePathname());
  const estilo = (ativo: boolean) =>
    `flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition ${
      ativo ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100" : "text-neutral-500 dark:text-neutral-400"
    }`;
  return (
    <div className="mb-4 flex rounded-xl bg-neutral-200/70 p-1 dark:bg-neutral-800">
      <Link href="/dashboard" className={estilo(!pessoal)}>
        Harmonize
      </Link>
      <Link href="/pessoal" className={estilo(pessoal)}>
        Pessoal
      </Link>
    </div>
  );
}
