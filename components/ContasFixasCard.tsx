"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { valorParaNumero, numeroParaCampo } from "@/lib/valor";
import type { DespesaFixa, TipoDespesaFixa } from "@/lib/meta-mes";

interface Linha {
  chave: number;
  nome: string;
  valor: string;
  tipo: TipoDespesaFixa;
}

/**
 * Contas fixas do mês (parcelas dos equipamentos, aluguel, etc.). É a base
 * do quadro "Este mês" do Dashboard: quanto falta sobrar das locações para
 * pagar tudo. "Pessoal" separa o que é da vida pessoal paga pelo caixa da
 * empresa, para o quadro mostrar as duas partes.
 */
export default function ContasFixasCard({ inicial }: { inicial: DespesaFixa[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    inicial.map((d, i) => ({ chave: i, nome: d.nome, valor: numeroParaCampo(d.valor), tipo: d.tipo }))
  );
  const [proxima, setProxima] = useState(inicial.length);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);

  const total = linhas.reduce((s, l) => {
    const v = valorParaNumero(l.valor);
    return s + (Number.isFinite(v) ? v : 0);
  }, 0);

  function alterar(chave: number, campo: Partial<Linha>) {
    setLinhas((prev) => prev.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));
  }

  function adicionar() {
    setLinhas((prev) => [...prev, { chave: proxima, nome: "", valor: "", tipo: "negocio" }]);
    setProxima((n) => n + 1);
  }

  async function salvar() {
    const lista: DespesaFixa[] = [];
    for (const l of linhas) {
      if (!l.nome.trim() && !l.valor.trim()) continue;
      const valor = valorParaNumero(l.valor);
      if (!l.nome.trim() || !Number.isFinite(valor) || valor <= 0) {
        setErro("Cada conta precisa de nome e de um valor maior que zero.");
        return;
      }
      lista.push({ nome: l.nome.trim(), valor: Math.round(valor * 100) / 100, tipo: l.tipo });
    }
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("settings")
      .update({ despesas_fixas: lista, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
      .eq("id", true);
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar. Tente novamente.");
      return;
    }
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-5 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Contas fixas do mês</h2>
      <p className="mb-4 text-xs text-neutral-400">
        O que precisa ser pago todo mês. O Dashboard mostra quanto falta as locações renderem para cobrir isso.
      </p>

      <div className="space-y-2">
        {linhas.map((l) => (
          <div key={l.chave} className="rounded-xl border border-neutral-200 p-2 dark:border-neutral-700">
            <div className="flex gap-2">
              <input
                value={l.nome}
                onChange={(e) => alterar(l.chave, { nome: e.target.value })}
                placeholder="Ex: Parcela HIPRO 1"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <input
                inputMode="decimal"
                value={l.valor}
                onChange={(e) => alterar(l.chave, { valor: e.target.value })}
                placeholder="0,00"
                className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-right text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div className="flex gap-1">
                {(["negocio", "pessoal"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => alterar(l.chave, { tipo: t })}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      l.tipo === t
                        ? "bg-brand-teal text-white"
                        : "border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                    }`}
                  >
                    {t === "negocio" ? "Negócio" : "Pessoal"}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setLinhas((prev) => prev.filter((x) => x.chave !== l.chave))}
                className="text-xs text-red-600 dark:text-red-400"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={adicionar}
        className="mt-2 w-full rounded-xl border border-dashed border-neutral-300 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
      >
        + Adicionar conta
      </button>

      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-neutral-500">Total por mês</span>
        <span className="font-semibold text-neutral-900 dark:text-neutral-100">{formatCurrency(total)}</span>
      </div>

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <button
        type="button"
        onClick={salvar}
        disabled={salvando}
        className="mt-3 w-full rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white disabled:opacity-60"
      >
        {salvando ? "Salvando..." : salvo ? "Salvo!" : "Salvar contas fixas"}
      </button>
    </div>
  );
}
