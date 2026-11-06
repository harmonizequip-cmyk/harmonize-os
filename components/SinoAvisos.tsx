"use client";

// Sino do topo (celular) e da barra lateral (computador): leva à tela de
// Avisos e mostra sempre quantos avisos do "Precisa de você" estão abertos
// (vermelho se algum é urgente). A conta vem de /api/pendencias, guardada por
// 5 minutos nesta aba; a tela de Avisos e marcar como lida pedem outra na hora
// (evento "harmonize:pendencias-mudou"). Fica fora do Pessoal e da visualização.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { ehEspacoPessoal } from "@/lib/espaco";
import { textoSelo, type ResumoPendencias } from "@/lib/notificacoes";
import { useSomenteLeitura } from "./SomenteLeitura";

const CHAVE = "harmonize-pendencias";
const VALIDADE_MS = 5 * 60 * 1000;
export const EVENTO_PENDENCIAS = "harmonize:pendencias-mudou";

function lerCache(): (ResumoPendencias & { t: number }) | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(CHAVE) ?? "null");
    return v && typeof v.total === "number" ? v : null;
  } catch {
    return null;
  }
}

export default function SinoAvisos({ variante = "topo", recolhido = false }: { variante?: "topo" | "lateral"; recolhido?: boolean }) {
  const pathname = usePathname();
  const somenteLeitura = useSomenteLeitura();
  const pessoal = ehEspacoPessoal(pathname);
  const [resumo, setResumo] = useState<ResumoPendencias | null>(null);

  const atualizar = useCallback(async (forcar = false) => {
    const cache = lerCache();
    if (cache) setResumo(cache);
    if (!forcar && cache && Date.now() - cache.t < VALIDADE_MS) return;
    try {
      const r = await fetch("/api/pendencias", { cache: "no-store" });
      if (!r.ok) return;
      const novo = (await r.json()) as ResumoPendencias;
      if (typeof novo.total !== "number") return;
      setResumo(novo);
      try {
        sessionStorage.setItem(CHAVE, JSON.stringify({ ...novo, t: Date.now() }));
      } catch {
        // sem armazenamento: só não guarda
      }
    } catch {
      // sem rede: fica o último número
    }
  }, []);

  useEffect(() => {
    if (somenteLeitura || pessoal) return;
    atualizar();
  }, [pathname, somenteLeitura, pessoal, atualizar]);

  useEffect(() => {
    const ouvir = () => atualizar(true);
    const voltar = () => document.visibilityState === "visible" && atualizar();
    window.addEventListener(EVENTO_PENDENCIAS, ouvir);
    document.addEventListener("visibilitychange", voltar);
    return () => {
      window.removeEventListener(EVENTO_PENDENCIAS, ouvir);
      document.removeEventListener("visibilitychange", voltar);
    };
  }, [atualizar]);

  if (somenteLeitura || pessoal) return null;
  const selo = textoSelo(resumo?.total ?? 0);
  const cor = (resumo?.urgentes ?? 0) > 0 ? "bg-rose-500" : "bg-amber-500";
  const ativo = pathname === "/avisos";
  const rotulo = selo ? `Avisos: ${resumo?.total} pendentes` : "Avisos";
  const pontoNaoLida = !selo && (resumo?.naoLidas ?? 0) > 0;

  const icone = (
    <span className="relative inline-flex">
      <Bell size={variante === "topo" ? 18 : 17} strokeWidth={1.75} />
      {selo && (
        <span className={`absolute -right-2 -top-1.5 min-w-[17px] rounded-full px-1 text-center text-[10px] font-extrabold leading-[17px] text-white ring-2 ring-white ${cor}`}>
          {selo}
        </span>
      )}
      {pontoNaoLida && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-brand-teal ring-2 ring-white" />}
    </span>
  );

  if (variante === "topo") {
    return (
      <Link href="/avisos" aria-label={rotulo} className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition hover:bg-neutral-100">
        {icone}
      </Link>
    );
  }
  return (
    <Link
      href="/avisos"
      title={recolhido ? rotulo : undefined}
      aria-label={rotulo}
      className={`flex items-center rounded-lg text-sm transition ${ativo ? "bg-neutral-900 font-medium text-white" : "text-neutral-600 hover:bg-neutral-100"} ${
        recolhido ? "mx-auto h-8 w-8 justify-center" : "w-full gap-3 px-3 py-2"
      }`}
    >
      {icone}
      {!recolhido && <span className="flex-1">Avisos</span>}
      {!recolhido && selo && <span className="text-xs font-bold text-neutral-400">{resumo?.total}</span>}
    </Link>
  );
}
