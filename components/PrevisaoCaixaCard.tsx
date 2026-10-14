"use client";

// Previsão de caixa dos próximos 30 ou 60 dias (conta em lib/previsao.ts).
// Valores das reservas são estimativas: a locação só tem valor quando é
// finalizada com os disparos.

import { useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PrevisaoCaixa } from "@/lib/previsao";

const ROTULO_BASE = { cliente: "média do cliente", media: "média geral", sem: "sem histórico" } as const;

export default function PrevisaoCaixaCard({ p30, p60 }: { p30: PrevisaoCaixa; p60: PrevisaoCaixa }) {
  const [dias, setDias] = useState<30 | 60>(30);
  const [verLista, setVerLista] = useState(false);
  const p = dias === 30 ? p30 : p60;
  const positivo = p.saldo >= 0;

  const linha = (rotulo: string, valor: number, sinal: "+" | "-", dica?: string) => (
    <div className="flex items-baseline justify-between gap-3 text-xs">
      <span className="text-neutral-600">
        {rotulo}
        {dica && <span className="block text-[10px] text-neutral-400">{dica}</span>}
      </span>
      <span className={`shrink-0 font-medium ${sinal === "+" ? "text-brand-teal" : "text-neutral-700"}`}>
        {sinal === "+" ? "+ " : "− "}
        {formatCurrency(valor)}
      </span>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-neutral-400">Previsão de caixa</p>
        <div className="flex rounded-lg bg-neutral-100 p-0.5 text-[11px]">
          {([30, 60] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDias(d)}
              className={`rounded-md px-2.5 py-1 font-medium ${
                dias === d ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              {d} dias
            </button>
          ))}
        </div>
      </div>

      <p className={`mt-2 text-lg font-semibold ${positivo ? "text-brand-teal" : "text-red-600"}`}>
        {positivo ? "Sobra" : "Falta"} ≈ {formatCurrency(Math.abs(p.saldo))}
      </p>
      <p className="text-[11px] text-neutral-500">nos próximos {dias} dias, se as reservas acontecerem</p>

      <div className="mt-3 space-y-1.5">
        {linha(
          `${p.reservas.length} ${p.reservas.length === 1 ? "reserva marcada" : "reservas marcadas"}`,
          p.entradasReservas,
          "+",
          "estimado pela média; taxa já paga descontada"
        )}
        {p.aReceberVencido > 0 && linha("A receber de locações que já passaram", p.aReceberVencido, "+")}
        {p.custosLocacoes > 0 && linha("Custos das locações", p.custosLocacoes, "-", "combustível, hospedagem... pela média")}
        {p.faturasCartao > 0 && linha("Faturas de cartão a pagar", p.faturasCartao, "-")}
        {p.contasFixas > 0 && linha(`Contas fixas (${p.meses} ${p.meses === 1 ? "mês" : "meses"})`, p.contasFixas, "-")}
      </div>

      {p.reservas.length > 0 && (
        <>
          <button type="button" onClick={() => setVerLista((v) => !v)} className="mt-3 text-[11px] font-medium text-brand-teal">
            {verLista ? "Esconder reservas" : "Ver as reservas da conta"}
          </button>
          {verLista && (
            <ul className="mt-2 divide-y divide-neutral-200/70">
              {p.reservas.map((r) => (
                <li key={r.id}>
                  <Link href="/agenda" className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                    <span className="min-w-0">
                      <span className="text-neutral-500">{formatDate(r.data)}</span>{" "}
                      <span className="font-medium text-neutral-800">{r.clienteNome ?? "Sem cliente"}</span>
                      <span className="block text-[10px] text-neutral-400">
                        {r.mentoria ? "Mentoria" : r.equipamento} · {ROTULO_BASE[r.base]}
                        {r.taxaPaga > 0 ? ` · taxa paga ${formatCurrency(r.taxaPaga)}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-neutral-700">
                      {r.base === "sem" ? "?" : `≈ ${formatCurrency(r.aEntrar)}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
