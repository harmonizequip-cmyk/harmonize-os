"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { garantirInscricao } from "@/lib/push";

// Registra o service worker em toda tela logada: é o que deixa o Harmonize ser
// instalado como app e receber avisos com ele fechado. Também confere se este
// aparelho continua inscrito nos avisos e refaz a inscrição se ela morreu
// (reinstalar o app mata a antiga), sem precisar ir em Configurações.
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => garantirInscricao(createClient() as any))
      .catch(() => {});
  }, []);
  return null;
}
