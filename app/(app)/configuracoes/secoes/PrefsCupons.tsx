"use client";

// Cupons de desconto (28/11/2026, pedido do dono): nome e porcentagem de cada
// cupom que aparece para escolher no desconto da calculadora (resumo e imagem
// saem com "Cupom BLACK FRIDAY (15%)"). O de indicação é automático e não fica aqui.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import type { Preferencias } from "@/lib/preferencias";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { MAX_CUPONS, MAX_NOME_CUPOM, normalizarCupom, type Cupom } from "@/lib/cupons";
import { BarraSalvar, Bloco } from "../ui";

type Linha = { nome: string; percentual: string };

const paraLinhas = (l: Cupom[]): Linha[] => l.map((c) => ({ nome: c.nome, percentual: String(c.percentual).replace(".", ",") }));

export default function PrefsCupons({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = paraLinhas(preferencias.cupons.lista);
  const [linhas, setLinhas] = useState<Linha[]>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const alterado = JSON.stringify(linhas) !== JSON.stringify(inicial);

  function mudar(i: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
    setSalvo(false);
    setErro(null);
  }

  async function salvar() {
    const lista: Cupom[] = [];
    for (const l of linhas) {
      const nome = normalizarCupom(l.nome);
      const p = Number(l.percentual.replace(",", "."));
      if (!nome && !l.percentual.trim()) continue;
      if (!nome) return setErro("Dê um nome a cada cupom.");
      if (!(p > 0 && p <= 100)) return setErro(`O cupom ${nome} precisa de uma porcentagem entre 0 e 100.`);
      if (lista.some((c) => c.nome === nome)) return setErro(`O cupom ${nome} está repetido.`);
      lista.push({ nome, percentual: Math.round(p * 100) / 100 });
    }
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { cupons: { lista } });
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    esquecerPreferenciasDoNavegador();
    setLinhas(paraLinhas(r.preferencias.cupons.lista));
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco
        titulo="Cupons de desconto"
        dica="Aparecem para escolher no desconto da calculadora. No resumo do WhatsApp e na imagem do cálculo sai o nome, por exemplo 'Cupom BLACK FRIDAY (15%)'. O cupom de indicação entra sozinho quando a cliente tem desconto e não precisa estar aqui."
      >
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={l.nome}
                onChange={(e) => mudar(i, { nome: e.target.value })}
                placeholder="Nome (ex.: BLACK FRIDAY)"
                maxLength={MAX_NOME_CUPOM}
                className="min-w-0 flex-1 rounded-xl border border-neutral-300 px-3 py-2 text-sm uppercase"
                aria-label="Nome do cupom"
              />
              <div className="flex w-24 items-center rounded-xl border border-neutral-300 px-2">
                <input
                  value={l.percentual}
                  onChange={(e) => mudar(i, { percentual: e.target.value.replace(/[^\d,.]/g, "") })}
                  inputMode="decimal"
                  placeholder="15"
                  className="w-full py-2 text-right text-sm outline-none"
                  aria-label="Porcentagem do cupom"
                />
                <span className="pl-1 text-sm text-neutral-500">%</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLinhas((ls) => ls.filter((_, j) => j !== i));
                  setSalvo(false);
                }}
                aria-label="Remover cupom"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-500 hover:text-rose-600"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {linhas.length < MAX_CUPONS && (
            <button
              type="button"
              onClick={() => {
                setLinhas((ls) => [...ls, { nome: "", percentual: "" }]);
                setSalvo(false);
              }}
              className="flex items-center gap-1.5 text-sm font-semibold text-brand-teal-dark"
            >
              <Plus size={16} /> Adicionar cupom
            </button>
          )}
        </div>
      </Bloco>
      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setLinhas(inicial)} />
    </div>
  );
}
