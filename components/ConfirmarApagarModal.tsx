"use client";

// Confirmação por palavra (mesmo critério do ConfirmarExclusaoModal): só apaga
// depois de escrever APAGAR. Para exclusões que não passam pela prévia do banco
// (ex.: planejamento de paciente).

import { useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

const PALAVRA = "APAGAR";

export default function ConfirmarApagarModal({
  titulo,
  descricao,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  descricao?: string;
  onCancelar: () => void;
  /** Devolve uma mensagem de erro, ou nada se apagou. */
  onConfirmar: () => Promise<string | null | void>;
}) {
  const [texto, setTexto] = useState("");
  const [apagando, setApagando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const pode = texto.trim().toUpperCase() === PALAVRA && !apagando;

  async function apagar() {
    if (!pode) return;
    setApagando(true);
    setErro(null);
    const e = await onConfirmar();
    if (e) {
      setErro(e);
      setApagando(false);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onCancelar}>
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <Trash2 size={18} />
          </span>
          <p className="text-base font-bold text-neutral-900">{titulo}</p>
        </div>
        {descricao && <p className="mt-3 text-sm text-neutral-600">{descricao}</p>}
        <p className="mt-3 text-sm font-medium text-neutral-800">Não dá para desfazer. Para confirmar, escreva {PALAVRA}:</p>
        <input
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apagar()}
          placeholder={PALAVRA}
          autoCapitalize="characters"
          autoComplete="off"
          className="mt-2 w-full rounded-xl px-3.5 py-3 text-base font-semibold tracking-widest ring-1 ring-neutral-300 outline-none focus:ring-2 focus:ring-rose-400"
        />
        {erro && <p className="mt-2 text-sm text-rose-600">{erro}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onCancelar} className="rounded-2xl py-3 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-300">
            Cancelar
          </button>
          <button onClick={apagar} disabled={!pode} className="flex items-center justify-center gap-1.5 rounded-2xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-40">
            {apagando ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} Apagar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
