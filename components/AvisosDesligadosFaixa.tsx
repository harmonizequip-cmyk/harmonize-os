"use client";

// Faixa no topo do app quando os avisos do Harmonize não estão chegando neste
// celular: permissão de notificação não dada (reinstalar o app zera) ou
// inscrição que não ficou gravada. O Android só deixa pedir a permissão
// depois de um toque, então a faixa traz o botão. Some quando liga, quando o
// dono tocou em "Desligar" em Configurações, ou por hoje no "agora não".

import { useEffect, useState } from "react";
import { BellOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisosSuportados, garantirInscricao, marcarAvisosDesligados } from "@/lib/push";

const CHAVE_ADIADO = "harmonize-faixa-avisos-adiada";

function hojeIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AvisosDesligadosFaixa() {
  const [mostrar, setMostrar] = useState<"pedir" | "bloqueado" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!avisosSuportados()) return;
      try {
        if (localStorage.getItem("harmonize-avisos-desligados") === "1") return;
        if (localStorage.getItem(CHAVE_ADIADO) === hojeIso()) return;
      } catch {
        // sem armazenamento: segue mostrando quando precisar
      }
      if (Notification.permission === "denied") return setMostrar("bloqueado");
      if (Notification.permission !== "granted") return setMostrar("pedir");
      // Permissão dada: confere (e refaz) a inscrição; se falhar, oferece o botão.
      const ok = await garantirInscricao(createClient() as any).catch(() => false);
      if (!ok) setMostrar("pedir");
    })();
  }, []);

  async function ativar() {
    setOcupado(true);
    setErro(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao === "denied") return setMostrar("bloqueado");
      if (permissao !== "granted") return setErro("Os avisos não foram autorizados.");
      marcarAvisosDesligados(false);
      const ok = await garantirInscricao(createClient() as any, true);
      if (!ok) throw new Error();
      setMostrar(null);
    } catch {
      setErro("Não consegui ligar. Tente em Configurações > Avisos no celular.");
    } finally {
      setOcupado(false);
    }
  }

  function adiar() {
    try {
      localStorage.setItem(CHAVE_ADIADO, hojeIso());
    } catch {
      // sem armazenamento: só esconde agora
    }
    setMostrar(null);
  }

  if (!mostrar) return null;

  return (
    <div className="mb-3 rounded-2xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/15">
      <div className="flex items-start gap-2">
        <BellOff size={18} className="mt-0.5 flex-shrink-0 text-amber-700 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Os avisos do Harmonize estão desligados neste celular.</p>
          {mostrar === "bloqueado" ? (
            <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
              As notificações estão bloqueadas. Segure o ícone do Harmonize, toque em (i) Informações do app &gt;
              Notificações e libere. Depois abra o app de novo.
            </p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={ativar}
                disabled={ocupado}
                className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {ocupado ? "Ligando..." : "Ativar avisos"}
              </button>
              <button type="button" onClick={adiar} className="text-xs text-amber-800 underline underline-offset-2 dark:text-amber-300">
                agora não
              </button>
            </div>
          )}
          {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
