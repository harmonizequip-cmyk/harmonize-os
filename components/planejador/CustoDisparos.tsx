"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { Folha } from "@/components/planejador/Partes";
import { formatCurrency } from "@/lib/format";
import type { Plano } from "@/lib/planejador";
import { TAXAS_PADRAO, areasParaCusto, custoDisparos, lerTaxa } from "@/lib/custo-disparos";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const rotuloTaxa = (t: number) => `R$ ${t.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`;

/**
 * Custos de disparos: pega o que foi distribuído no planejamento e multiplica pelo valor por
 * disparo (0,12, 0,10, 0,07 ou outro). Dá para trocar a quantidade de cada área aqui e ver o
 * custo final mudar; só vai para o planejamento se tocar em "Aplicar no planejamento".
 */
export default function CustoDisparos({
  aberta,
  onFechar,
  plano,
  podeAplicar,
  onAplicar,
}: {
  aberta: boolean;
  onFechar: () => void;
  plano: Plano;
  podeAplicar: boolean;
  onAplicar: (quantidades: Record<string, number>) => void;
}) {
  const areas = useMemo(() => areasParaCusto(plano), [plano]);
  const [outra, setOutra] = useState("");
  const [qtd, setQtd] = useState<Record<string, string>>({});

  // Cada vez que abre (ou o plano muda por fora), volta às quantidades do planejamento.
  useEffect(() => {
    if (!aberta) return;
    setQtd(Object.fromEntries(areas.map((a) => [a.id, String(a.disparos)])));
  }, [aberta, areas]);

  const numero = (id: string) => Math.max(0, Math.round(Number((qtd[id] ?? "").replace(/\D/g, "")) || 0));
  const linhas = areas.map((a) => ({ ...a, novo: numero(a.id), mudou: numero(a.id) !== a.disparos }));
  const totalAtual = linhas.reduce((t, l) => t + l.disparos, 0);
  const totalNovo = linhas.reduce((t, l) => t + l.novo, 0);
  const mudou = linhas.some((l) => l.mudou);
  const taxaOutra = lerTaxa(outra);
  const taxas = taxaOutra > 0 && !TAXAS_PADRAO.includes(taxaOutra) ? [...TAXAS_PADRAO, taxaOutra] : TAXAS_PADRAO;
  const entrada = "w-28 rounded-xl bg-white px-3 py-2 text-right text-[15px] font-bold tabular-nums text-neutral-900 ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-brand-teal";

  return (
    <Folha
      aberta={aberta}
      onFechar={onFechar}
      titulo="Custos de disparos"
      rodape={
        podeAplicar && mudou ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setQtd(Object.fromEntries(areas.map((a) => [a.id, String(a.disparos)])))} className="flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200">
              <RotateCcw size={15} /> Voltar
            </button>
            <button
              type="button"
              onClick={() => {
                onAplicar(Object.fromEntries(linhas.filter((l) => l.mudou).map((l) => [l.id, l.novo])));
                onFechar();
              }}
              className="flex flex-1 items-center justify-center rounded-2xl bg-brand-gradient py-3 text-sm font-bold text-white shadow-glow-teal"
            >
              Aplicar no planejamento
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4 pb-2">
        {areas.length === 0 ? (
          <p className="rounded-2xl bg-neutral-50 p-5 text-center text-sm text-neutral-500">Distribua os disparos nas áreas para ver o custo.</p>
        ) : (
          <>
            <div className="rounded-3xl bg-gradient-to-br from-[#05302d] via-[#0b6b63] to-[#1fae9f] p-4 text-white">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-100">
                <Calculator size={13} /> Total distribuído
              </p>
              <p className="mt-1 text-[1.75rem] font-black tabular-nums leading-tight">
                {fmt(totalNovo)} <span className="text-base font-bold text-teal-100">disparos</span>
              </p>
              {mudou && <p className="text-[12.5px] text-teal-100">no planejamento: {fmt(totalAtual)}</p>}
              <div className={`mt-3 grid gap-1.5 text-center ${taxas.length > 3 ? "grid-cols-2" : "grid-cols-3"}`}>
                {taxas.map((t) => (
                  <div key={t} className="rounded-2xl bg-white/15 px-1 py-2.5">
                    <p className="text-[11px] font-semibold text-teal-100">× {rotuloTaxa(t)}</p>
                    <p className="text-[17px] font-black tabular-nums">{formatCurrency(custoDisparos(totalNovo, t))}</p>
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Outro valor por disparo (opcional)</span>
              <input
                inputMode="decimal"
                value={outra}
                placeholder="Ex.: 0,09"
                onChange={(e) => setOutra(e.target.value.replace(/[^\d,.]/g, ""))}
                className="w-full rounded-xl bg-white px-3.5 py-2.5 text-[15px] text-neutral-900 ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-brand-teal"
              />
            </label>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Por área (dá para mudar a quantidade)</p>
              {linhas.map((l) => (
                <div key={l.id} className={`rounded-2xl p-2.5 ring-1 ${l.mudou ? "bg-amber-50/70 ring-amber-200" : "bg-neutral-50 ring-neutral-200/70"}`}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-neutral-900">{l.nome}</p>
                    <input
                      inputMode="numeric"
                      value={qtd[l.id] === undefined ? "" : fmt(numero(l.id))}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setQtd((q) => ({ ...q, [l.id]: e.target.value.replace(/\D/g, "") }))}
                      className={entrada}
                      aria-label={`Disparos de ${l.nome}`}
                    />
                  </div>
                  <p className="mt-1 text-[11.5px] tabular-nums text-neutral-500">
                    {TAXAS_PADRAO.map((t) => `${rotuloTaxa(t)}: ${formatCurrency(custoDisparos(l.novo, t))}`).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
            {podeAplicar && <p className="text-center text-[11px] text-neutral-400">Mudar a quantidade aqui só simula. Para levar ao planejamento, toque em Aplicar.</p>}
          </>
        )}
      </div>
    </Folha>
  );
}
