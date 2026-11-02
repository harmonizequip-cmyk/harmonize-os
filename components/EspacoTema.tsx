"use client";

// Marca o <html> com "espaco-pessoal" enquanto o endereço for /pessoal...:
// o Pessoal tem paleta e destaque próprios (app/globals.css), para nunca ser
// confundido com a Harmonize. O primeiro desenho já vem marcado pelo script
// do app/layout.tsx; este componente cuida da troca de espaço sem recarregar
// (e tira/põe o tema HIPRO, que não vale no Pessoal).

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";
import { aplicarTema, lerTemaGuardado } from "@/lib/tema";

export default function EspacoTema() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.classList.toggle("espaco-pessoal", ehEspacoPessoal(pathname));
    // O tema HIPRO não vale dentro do Pessoal: entra e sai junto com o espaço.
    aplicarTema(lerTemaGuardado(), pathname);
  }, [pathname]);
  return null;
}
