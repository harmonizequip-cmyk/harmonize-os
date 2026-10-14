"use client";

import { useEffect, useRef, useState } from "react";
import { filtrarParaEscolha } from "@/lib/busca-cliente";

/**
 * Filtro de lista longa (ex: "Todos os clientes") com campo de busca, no
 * lugar do select nativo, que no celular vira uma roleta de 200 nomes.
 */
export default function FiltroComBusca({
  valor,
  rotuloVazio,
  opcoes,
  onChange,
}: {
  valor: string;
  rotuloVazio: string;
  opcoes: { valor: string; label: string }[];
  onChange: (valor: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [consulta, setConsulta] = useState("");

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  const selecionada = opcoes.find((o) => o.valor === valor);
  const lista = filtrarParaEscolha(
    opcoes.map((o) => ({ ...o, name: o.label })),
    consulta
  ).slice(0, 50);

  return (
    <div ref={ref} className="relative">
      <input
        value={aberto ? consulta : (selecionada?.label ?? "")}
        onFocus={() => {
          setConsulta("");
          setAberto(true);
        }}
        onChange={(e) => setConsulta(e.target.value)}
        placeholder={rotuloVazio}
        className={`w-48 rounded-lg border px-2 py-1.5 text-xs ${
          valor
            ? "border-brand-teal text-brand-teal"
            : "border-neutral-300 text-neutral-600 placeholder:text-neutral-600"
        }`}
      />
      {aberto && (
        <div className="absolute left-0 z-30 mt-1 max-h-64 w-72 max-w-[85vw] overflow-y-auto rounded-xl border border-neutral-200 bg-white shadow-lg">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setAberto(false);
            }}
            className="block w-full px-3 py-2 text-left text-xs text-neutral-500 hover:bg-neutral-50"
          >
            {rotuloVazio}
          </button>
          {lista.length === 0 && <p className="px-3 py-2 text-xs text-neutral-400">Ninguém encontrado.</p>}
          {lista.map((o) => (
            <button
              key={o.valor}
              type="button"
              onClick={() => {
                onChange(o.valor);
                setAberto(false);
              }}
              className="block w-full px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
