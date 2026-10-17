import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { CORES_ROSCA, visualDaCategoria } from "@/lib/pessoal-icones";
import type { ComparacaoCategoria } from "@/lib/pessoal-controle";

/** Rosca de "para onde foi" com a variação de cada categoria contra a média dos 3 meses anteriores. */
export default function RosquinhaGastos({ itens, total }: { itens: ComparacaoCategoria[]; total: number }) {
  const topo = itens.slice(0, 6);
  const resto = itens.slice(6).reduce((s, i) => s + i.atual, 0);
  const fatias = [...topo.map((i) => ({ nome: i.categoria, valor: i.atual })), ...(resto > 0 ? [{ nome: "Outras", valor: resto }] : [])];
  const r = 40;
  const c = 2 * Math.PI * r;
  let acumulado = 0;

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="relative h-32 w-32 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="#ede9fe" strokeWidth="14" />
            {fatias.map((f, i) => {
              const parte = total > 0 ? f.valor / total : 0;
              const traco = Math.max(0, parte * c - 1.5);
              const el = (
                <circle
                  key={f.nome}
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={CORES_ROSCA[i % CORES_ROSCA.length]}
                  strokeWidth="14"
                  strokeDasharray={`${traco} ${c - traco}`}
                  strokeDashoffset={-acumulado * c}
                />
              );
              acumulado += parte;
              return el;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gasto</span>
            <span className="text-[12px] font-black tabular-nums text-slate-900">{formatCurrency(total)}</span>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-1.5">
          {fatias.slice(0, 5).map((f, i) => (
            <li key={f.nome} className="flex items-center gap-2 text-[12.5px]">
              <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: CORES_ROSCA[i % CORES_ROSCA.length] }} />
              <span className="min-w-0 flex-1 truncate text-slate-700">{f.nome}</span>
              <span className="font-bold tabular-nums text-slate-900">{total > 0 ? Math.round((f.valor / total) * 100) : 0}%</span>
            </li>
          ))}
        </ul>
      </div>

      <ul className="mt-4 divide-y divide-violet-100">
        {topo.slice(0, 5).map((i) => {
          const v = visualDaCategoria(i.categoria);
          const Icone = v.icone;
          return (
            <li key={i.categoria} className="flex items-center gap-3 py-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${v.cor}1f`, color: v.cor }}>
                <Icone size={18} strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">{i.categoria}</span>
                <span className="block text-[11.5px] text-slate-500">
                  {i.media > 0 ? `média ${formatCurrency(i.media)} por mês` : "sem histórico para comparar"}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-sm font-extrabold tabular-nums text-slate-900">{formatCurrency(i.atual)}</span>
                {i.variacao !== null && Math.abs(i.variacao) >= 0.05 && (
                  <span className={`inline-flex items-center text-[11px] font-bold ${i.variacao > 0 ? "text-rose-500" : "text-emerald-600"}`}>
                    {i.variacao > 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(Math.round(i.variacao * 100))}%
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
