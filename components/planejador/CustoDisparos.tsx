"use client";

import { useEffect, useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { Folha } from "@/components/planejador/Partes";
import { formatCurrency } from "@/lib/format";
import type { Plano } from "@/lib/planejador";
import { TAXAS_PADRAO, areasParaCusto, custoDisparos, lerTaxa } from "@/lib/custo-disparos";

const CHAVE_TAXA = "harmonize-custo-disparo-taxa";
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
  const [taxa, setTaxa] = useState(0.1);
  const [outra, setOutra] = useState("");
  const [qtd, setQtd] = useState<Record<string, string>>({});

  // Cada vez que abre (ou o plano muda por fora), volta às quantidades do planejamento.
  useEffect(() => {
    if (!aberta) return;
    setQtd(Object.fromEntries(areas.map((a) => [a.id, String(a.disparos)])));
    try {
      const salva = Number(localStorage.getItem(CHAVE_TAXA));
      if (salva > 0) {
        setTaxa(salva);
        if (!TAXAS_PADRAO.includes(salva)) setOutra(String(salva).replace(".", ","));
      }
    } catch {
      // sem armazenamento: segue com 0,10
    }
  }, [aberta, areas]);

  function escolher(t: number, texto = "") {
    setTaxa(t);
    setOutra(texto);
    try {
      localStorage.setItem(CHAVE_TAXA, String(t));
    } catch {
      // ignora
    }
  }

  const numero = (id: string) => Math.max(0, Math.round(Number((qtd[id] ?? "").replace(/\D/g, "")) || 0));
  const linhas = areas.map((a) => ({ ...a, novo: numero(a.id), mudou: numero(a.id) !== a.disparos }));
  const totalAtual = linhas.reduce((t, l) => t + l.disparos, 0);
  const totalNovo = linhas.reduce((t, l) => t + l.novo, 0);
  const mudou = linhas.some((l) => l.mudou);
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
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Valor por disparo</p>
              <div className="grid grid-cols-4 gap-1.5">
                {TAXAS_PADRAO.map((t) => (
                  <button key={t} type="button" onClick={() => escolher(t)} className={`rounded-2xl px-1 py-2.5 text-center text-xs font-bold ring-1 transition ${taxa === t && !outra ? "bg-brand-teal text-white ring-brand-teal shadow-glow-teal" : "bg-white text-neutral-700 ring-neutral-200"}`}>
                    {rotuloTaxa(t)}
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  value={outra}
                  placeholder="Outro"
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d,.]/g, "");
                    setOutra(v);
                    const t = lerTaxa(v);
                    if (t > 0) escolher(t, v);
                  }}
                  className={`rounded-2xl px-2 py-2.5 text-center text-xs font-bold outline-none ring-1 ${outra ? "bg-brand-teal text-white ring-brand-teal placeholder:text-white/70" : "bg-white text-neutral-700 ring-neutral-200"}`}
                  aria-label="Outro valor por disparo"
                />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Por área</p>
              {linhas.map((l) => (
                <div key={l.id} className={`flex items-center gap-2 rounded-2xl p-2.5 ring-1 ${l.mudou ? "bg-amber-50/70 ring-amber-200" : "bg-neutral-50 ring-neutral-200/70"}`}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-neutral-900">{l.nome}</p>
                    <p className="text-xs tabular-nums text-neutral-500">
                      {fmt(l.novo)} × {rotuloTaxa(taxa)} = <b className="text-neutral-800">{formatCurrency(custoDisparos(l.novo, taxa))}</b>
                    </p>
                  </div>
                  <input
                    inputMode="numeric"
                    value={qtd[l.id] === undefined ? "" : fmt(numero(l.id))}
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => setQtd((q) => ({ ...q, [l.id]: e.target.value.replace(/\D/g, "") }))}
                    className={entrada}
                    aria-label={`Disparos de ${l.nome}`}
                  />
                </div>
              ))}
            </div>

            <div className="rounded-3xl bg-gradient-to-br from-[#05302d] via-[#0b6b63] to-[#1fae9f] p-4 text-white">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-100">
                <Calculator size={13} /> Custo final
              </p>
              <p className="mt-1 text-[1.75rem] font-black tabular-nums leading-tight">{formatCurrency(custoDisparos(totalNovo, taxa))}</p>
              <p className="text-[12.5px] text-teal-100">
                {fmt(totalNovo)} disparos × {rotuloTaxa(taxa)}
                {mudou && <> · antes {formatCurrency(custoDisparos(totalAtual, taxa))} ({fmt(totalAtual)})</>}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                {TAXAS_PADRAO.map((t) => (
                  <div key={t} className="rounded-2xl bg-white/12 px-1 py-2">
                    <p className="text-[10px] font-semibold text-teal-100">{rotuloTaxa(t)}</p>
                    <p className="text-[13px] font-extrabold tabular-nums">{formatCurrency(custoDisparos(totalNovo, t))}</p>
                  </div>
                ))}
              </div>
            </div>
            {podeAplicar && <p className="text-center text-[11px] text-neutral-400">Mudar a quantidade aqui só simula. Para levar ao planejamento, toque em Aplicar.</p>}
          </>
        )}
      </div>
    </Folha>
  );
}
