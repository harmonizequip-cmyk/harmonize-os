"use client";

// Acesso só de visualização (profiles.somente_leitura): o banco já recusa
// qualquer gravação; aqui as telas escondem os botões de alterar.

import { createContext, useContext } from "react";

const Contexto = createContext(false);

export function SomenteLeituraProvider({ valor, children }: { valor: boolean; children: React.ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSomenteLeitura(): boolean {
  return useContext(Contexto);
}
