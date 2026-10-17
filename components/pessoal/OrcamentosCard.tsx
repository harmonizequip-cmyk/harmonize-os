import Link from "next/link";
import { Sparkles, Target } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { visualDaCategoria } from "@/lib/pessoal-icones";
import type { UsoOrcamento } from "@/lib/pessoal-controle";

const PEDIDO = "Monte um orçamento mensal por categoria para mim, com base na média dos meus gastos dos últimos 3 meses";

/** Barras de quanto de cada orçamento do mês já foi usado; sem orçamento, convida a pedir um ao assistente. */
export default function OrcamentosCard({ usos }: { usos: UsoOrcamento[] }) {
  return (
    <section className="cartao p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-[0.1em] text-violet-900/70">
          <Target size={14} /> Orçamento do mês
        </p>
        <Link href={`/pessoal/assistente?auto=1&pergunta=${encodeURIComponent(PEDIDO)}`} className="flex items-center gap-1 text-xs font-bold text-violet-700">
          <Sparkles size={13} /> {usos.length ? "Ajustar" : "Montar"}
        </Link>
      </div>
      {usos.length === 0 ? (
        <p className="py-2 text-sm text-slate-500">
          Nenhum limite definido. Toque em Montar e o assistente sugere um orçamento pela média dos seus gastos.
        </p>
      ) : (
        <ul className="space-y-3.5">
          {usos.map((u) => {
            const v = visualDaCategoria(u.categoria);
            const Icone = v.icone;
            const cor = u.pct >= 1 ? "#e11d48" : u.pct >= 0.8 ? "#f59e0b" : v.cor;
            return (
              <li key={u.categoria}>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${v.cor}1f`, color: v.cor }}>
                    <Icone size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{u.categoria}</span>
                  <span className="text-[12.5px] tabular-nums text-slate-600">
                    <b className="text-slate-900">{formatCurrency(u.gasto)}</b> de {formatCurrency(u.limite)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-violet-100">
                  <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.round(u.pct * 100))}%`, backgroundColor: cor }} />
                </div>
                {u.pct >= 1 && <p className="mt-0.5 text-[11.5px] font-semibold text-rose-600">Passou {formatCurrency(u.gasto - u.limite)} do limite</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
