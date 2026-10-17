"use client";

// Bloco "Precisa de você" do Dashboard: todos os avisos num cartão só, os
// urgentes primeiro, em linhas curtas. Cada linha leva à lista do que avisa
// (regra do CLAUDE.md). Mostra os 4 primeiros; o resto abre em "ver mais".

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, ChevronRight, PartyPopper } from "lucide-react";

export type NivelAviso = "urgente" | "atencao" | "info";

export interface AvisoDash {
  id: string;
  emoji: string;
  texto: string;
  detalhe?: string;
  href: string;
  nivel: NivelAviso;
}

const ORDEM: Record<NivelAviso, number> = { urgente: 0, atencao: 1, info: 2 };
const PONTO: Record<NivelAviso, string> = {
  urgente: "bg-rose-500",
  atencao: "bg-amber-400",
  info: "bg-brand-teal",
};

export default function PrecisaDeVoce({ avisos }: { avisos: AvisoDash[] }) {
  const [aberto, setAberto] = useState(false);
  const lista = [...avisos].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
  const urgentes = lista.filter((a) => a.nivel === "urgente").length;
  const visiveis = aberto ? lista : lista.slice(0, 4);

  if (lista.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
          <PartyPopper size={19} />
        </span>
        <div>
          <p className="text-sm font-bold text-neutral-900">Nada pendente agora</p>
          <p className="text-xs text-neutral-500">Sem cobrança atrasada, confirmação ou tarefa vencida.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-3xl bg-white p-2 ring-1 ring-neutral-200/80">
      <div className="flex items-center justify-between px-2.5 pb-1 pt-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
          Precisa de você <span className="text-neutral-400">· {lista.length}</span>
        </p>
        {urgentes > 0 && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
            {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}
          </span>
        )}
      </div>
      <ul>
        {visiveis.map((a) => (
          <li key={a.id}>
            <Link href={a.href} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 active:bg-neutral-50">
              <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-neutral-50 text-lg">
                {a.emoji}
                <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${PONTO[a.nivel]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-snug text-neutral-900">{a.texto}</span>
                {a.detalhe && <span className="block truncate text-[11.5px] text-neutral-500">{a.detalhe}</span>}
              </span>
              <ChevronRight size={16} className="flex-shrink-0 text-neutral-300" />
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > 4 && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-2xl py-2 text-xs font-semibold text-neutral-500"
        >
          {aberto ? "Mostrar menos" : `Ver mais ${lista.length - 4}`}
          <ChevronDown size={14} className={aberto ? "rotate-180" : ""} />
        </button>
      )}
    </section>
  );
}
