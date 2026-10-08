"use client";

import { useEffect } from "react";

// Registra o service worker em toda tela logada: é o que deixa o Harmonize ser
// instalado como app e receber avisos com ele fechado.
export default function RegistrarServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
