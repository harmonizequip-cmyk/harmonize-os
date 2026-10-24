"use client";

// Preferências de Configurações para componentes do navegador. Começa com os
// padrões (a tela nunca espera) e troca pelos valores salvos quando chegam.
// Uma busca só por carregamento da página, compartilhada entre componentes.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchPreferencias } from "@/lib/settings";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";

let emAndamento: Promise<Preferencias> | null = null;
let cache: Preferencias | null = null;

export function carregarPreferenciasNoNavegador(): Promise<Preferencias> {
  if (cache) return Promise.resolve(cache);
  if (!emAndamento) {
    emAndamento = fetchPreferencias(createClient())
      .then((p) => (cache = p))
      .catch(() => DEFAULT_PREFERENCIAS)
      .finally(() => {
        emAndamento = null;
      });
  }
  return emAndamento;
}

/** Depois de salvar em Configurações, descarta o que estava guardado. */
export function esquecerPreferenciasDoNavegador() {
  cache = null;
}

export function usePreferencias(): Preferencias {
  const [p, setP] = useState<Preferencias>(cache ?? DEFAULT_PREFERENCIAS);
  useEffect(() => {
    let vivo = true;
    carregarPreferenciasNoNavegador().then((x) => vivo && setP(x));
    return () => {
      vivo = false;
    };
  }, []);
  return p;
}
