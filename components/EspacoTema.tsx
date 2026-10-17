"use client";

// Marca o <html> com "espaco-pessoal" enquanto o endereço for /pessoal...:
// o Pessoal tem paleta e destaque próprios (app/globals.css), para nunca ser
// confundido com a Harmonize. O primeiro desenho já vem marcado pelo script
// do app/layout.tsx; este componente cuida da troca de espaço sem recarregar.

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";

export default function EspacoTema() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.classList.toggle("espaco-pessoal", ehEspacoPessoal(pathname));
  }, [pathname]);
  return null;
}
