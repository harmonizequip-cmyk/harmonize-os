"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Opcao {
  id: string;
  name: string;
  city: string | null;
}

// Escolha do cliente que indicou este cadastro. Carrega a lista uma vez e
// filtra enquanto digita. Só aceita cliente já cadastrado, para que as
// indicações possam ser contadas por pessoa. `excludeId` impede alguém de
// indicar a si mesmo.
export default function IndicadoPorSelect({
  value,
  onChange,
  excludeId,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  excludeId?: string;
}) {
  const supabase = createClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    supabase
      .from("clients")
      .select("id, name, city")
      .eq("is_test", false)
      .order("name")
      .limit(3000)
      .then(({ data }) => {
        if (active) setOpcoes((data ?? []) as Opcao[]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const selecionado = opcoes.find((o) => o.id === value);
  const termo = query.trim().toLowerCase();
  const filtradas = opcoes
    .filter((o) => o.id !== excludeId && (!termo || o.name.toLowerCase().includes(termo)))
    .slice(0, 8);

  return (
    <div ref={containerRef}>
      <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Indicado por <span className="text-neutral-400">(opcional)</span>
      </label>
      <div className="flex gap-2">
        <input
          value={open ? query : (selecionado?.name ?? (value ? "Carregando..." : ""))}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          placeholder="Buscar cliente que indicou..."
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setQuery("");
              setOpen(false);
            }}
            className="rounded-lg border border-neutral-300 px-3 text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
          >
            Limpar
          </button>
        )}
      </div>

      {open && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {filtradas.length === 0 ? (
            <p className="px-3 py-2 text-xs text-neutral-400">Nenhum cliente encontrado.</p>
          ) : (
            filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-700"
              >
                {o.name}
                {o.city && <span className="ml-2 text-xs text-neutral-400">{o.city}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
