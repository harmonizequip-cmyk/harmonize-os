"use client";

// Peças comuns das seções de Configurações: chave liga/desliga, campo com
// rótulo, bloco com título e o botão flutuante de salvar que só aparece
// quando há alteração.

import type { ReactNode } from "react";
import { Check, Loader2 } from "lucide-react";
import { valorParaNumero } from "@/lib/valor";

export function Chave({
  ligada,
  onChange,
  rotulo,
}: {
  ligada: boolean;
  onChange: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      onClick={() => onChange(!ligada)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${ligada ? "bg-brand-teal" : "bg-neutral-300"}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${ligada ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Bloco({ titulo, dica, children }: { titulo: string; dica?: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">{titulo}</p>
      {dica && <p className="mt-1 text-xs leading-relaxed text-neutral-500">{dica}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Campo({
  rotulo,
  valor,
  onChange,
  prefixo,
  sufixo,
  decimal = false,
}: {
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  prefixo?: string;
  sufixo?: string;
  decimal?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600">{rotulo}</span>
      <span className="flex items-center rounded-xl border border-neutral-300 bg-white focus-within:border-brand-teal focus-within:ring-2 focus-within:ring-brand-teal/20">
        {prefixo && <span className="pl-3 text-sm text-neutral-400">{prefixo}</span>}
        <input
          inputMode={decimal ? "decimal" : "numeric"}
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 rounded-xl bg-transparent px-3 py-2.5 text-sm font-semibold tabular-nums text-neutral-900 outline-none"
        />
        {sufixo && <span className="pr-3 text-xs text-neutral-400">{sufixo}</span>}
      </span>
    </label>
  );
}

/**
 * Botão de salvar que flutua acima da barra de baixo enquanto há alteração
 * não salva, e vira "Salvo" por um instante depois de gravar.
 */
export function BarraSalvar({
  alterado,
  salvando,
  salvo,
  erro,
  onSalvar,
  onDescartar,
  rotulo = "Salvar alterações",
}: {
  alterado: boolean;
  salvando: boolean;
  salvo: boolean;
  erro: string | null;
  onSalvar: () => void;
  onDescartar: () => void;
  rotulo?: string;
}) {
  if (!alterado && !salvo && !erro) return null;
  return (
    <div className="fixed bottom-[88px] left-4 right-4 z-20 mx-auto max-w-md md:bottom-6 md:left-auto md:right-8">
      <div className="flex items-center gap-2 rounded-2xl bg-neutral-900/95 p-2 pl-4 text-white shadow-2xl backdrop-blur">
        <p className="min-w-0 flex-1 text-xs leading-tight">
          {erro ? <span className="text-rose-300">{erro}</span> : salvo && !alterado ? "Salvo." : "Alterações não salvas"}
        </p>
        {alterado && !salvando && (
          <button type="button" onClick={onDescartar} className="rounded-xl px-3 py-2 text-xs font-medium text-neutral-300">
            Desfazer
          </button>
        )}
        {(alterado || salvando) && (
          <button
            type="button"
            onClick={onSalvar}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-xl bg-brand-gradient px-4 py-2 text-xs font-bold text-white disabled:opacity-70"
          >
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {salvando ? "Salvando..." : rotulo}
          </button>
        )}
      </div>
    </div>
  );
}

/** Campo vazio vale 0; o resto segue valorParaNumero ("0.6", "1.500", "1,5"). */
export function numero(v: string): number {
  return v.trim() === "" ? 0 : valorParaNumero(v);
}
