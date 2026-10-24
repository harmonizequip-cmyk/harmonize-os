"use client";

// Contas PIX para componentes do navegador. Começa com as de sempre (a tela
// nunca espera) e troca pelas da tabela contas_pix quando chegam. Uma busca só
// por carregamento da página, compartilhada entre componentes.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CONTAS_PIX_PADRAO, buscarContasPix, type ContaPix } from "@/lib/contas-pix";

let emAndamento: Promise<ContaPix[]> | null = null;
let cache: ContaPix[] | null = null;

function carregar(): Promise<ContaPix[]> {
  if (cache) return Promise.resolve(cache);
  if (!emAndamento) {
    emAndamento = buscarContasPix(createClient())
      .then((l) => (cache = l ?? CONTAS_PIX_PADRAO))
      .catch(() => CONTAS_PIX_PADRAO)
      .finally(() => {
        emAndamento = null;
      });
  }
  return emAndamento;
}

/** Depois de salvar em Configurações, descarta o que estava guardado. */
export function esquecerContasPixDoNavegador() {
  cache = null;
}

export function useContasPix(): ContaPix[] {
  const [l, setL] = useState<ContaPix[]>(cache ?? CONTAS_PIX_PADRAO);
  useEffect(() => {
    let vivo = true;
    carregar().then((x) => vivo && setL(x));
    return () => {
      vivo = false;
    };
  }, []);
  return l;
}
