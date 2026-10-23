import { ArrowDownRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { ResumoMesPessoal } from "@/lib/pessoal-controle";

/**
 * Destaque do topo do Pessoal: escuro (noite), com a rosca de quanto da
 * entrada já foi embora. De propósito bem diferente do destaque claro da
 * Harmonize, para os dois espaços nunca se confundirem.
 */
export default function HeroPessoal({ rotuloMes, resumo }: { rotuloMes: string; resumo: ResumoMesPessoal }) {
  const { entradas, saidas, sobrou, variacao, projecaoSobra } = resumo;
  const temEntrada = entradas > 0;
  const pct = temEntrada ? saidas / entradas : null;
  const r = 38;
  const c = 2 * Math.PI * r;
  const preenchido = Math.min(1, pct ?? 0);
  const estourou = pct !== null && pct > 1;
  const baixou = variacao !== null && variacao <= 0;

  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1b1450] via-[#3a2a9c] to-[#7c3aed] p-5 text-white shadow-[0_24px_50px_-24px_rgb(76_29_149/0.9)]">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-fuchsia-400/25 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-sky-400/20 blur-2xl" />

      <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-violet-200">Seu mês · {rotuloMes}</p>

      <div className="relative mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-violet-200">{temEntrada ? (sobrou >= 0 ? "Resultado do mês: sobrou" : "Resultado do mês: faltou") : "Já saiu no mês"}</p>
          <p className="whitespace-nowrap text-[1.75rem] font-black leading-tight tabular-nums">
            {formatCurrency(temEntrada ? Math.abs(sobrou) : saidas)}
          </p>
          <p className="mt-1 text-[12.5px] text-violet-200">
            {temEntrada ? `Entrou ${formatCurrency(entradas)}` : "Nenhuma entrada lançada neste mês"}
          </p>
        </div>
        <div className="relative h-24 w-24 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="11" />
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={estourou ? "#fb7185" : pct !== null && pct > 0.85 ? "#fbbf24" : "#c4b5fd"}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - preenchido)}
              style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black tabular-nums">{pct === null ? "-" : `${Math.round(pct * 100)}%`}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-200">gasto</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold backdrop-blur">
          <ArrowDownRight size={14} className="text-rose-300" /> Saiu {formatCurrency(saidas)}
        </span>
        {variacao !== null && (
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${baixou ? "bg-emerald-400/20 text-emerald-200" : "bg-rose-400/20 text-rose-200"}`}>
            {baixou ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}
            {Math.abs(Math.round(variacao * 100))}% {baixou ? "menos" : "mais"} que no mês passado
          </span>
        )}
        {temEntrada && resumo.dia >= 3 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-xs font-bold backdrop-blur">
            <TrendingUp size={14} className="text-violet-200" />
            Projeção: {projecaoSobra >= 0 ? "sobra" : "falta"} {formatCurrency(Math.abs(projecaoSobra))}
          </span>
        )}
      </div>
    </section>
  );
}
