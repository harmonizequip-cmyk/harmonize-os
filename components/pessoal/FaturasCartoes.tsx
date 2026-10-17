import Link from "next/link";
import { CreditCard } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { FaturaPessoal } from "@/lib/pessoal-controle";

const FUNDOS = [
  "from-[#2e1065] to-[#6d28d9]",
  "from-[#831843] to-[#db2777]",
  "from-[#0f172a] to-[#334155]",
  "from-[#134e4a] to-[#0d9488]",
];

/** Faturas abertas como cartões de crédito, em fileira que rola para o lado. */
export default function FaturasCartoes({ faturas, hoje }: { faturas: FaturaPessoal[]; hoje: string }) {
  if (faturas.length === 0) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between px-1">
        <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-violet-900/70">Faturas a pagar</p>
        <Link href="/pessoal/cartoes" className="text-xs font-bold text-violet-700">
          Ver cartões
        </Link>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
        {faturas.map((f, i) => {
          const vencida = f.vencimento < hoje;
          return (
            <Link
              key={f.cartao + f.vencimento}
              href="/pessoal/cartoes"
              className={`relative min-w-[78%] snap-start overflow-hidden rounded-3xl bg-gradient-to-br p-4 text-white shadow-[0_18px_34px_-18px_rgb(30_27_75/0.8)] sm:min-w-[280px] ${FUNDOS[i % FUNDOS.length]}`}
            >
              <span aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10" />
              <span aria-hidden className="absolute -bottom-12 right-6 h-28 w-28 rounded-full bg-white/10" />
              <div className="relative flex items-start justify-between">
                <CreditCard size={26} strokeWidth={1.6} className="text-white/80" />
                {vencida ? (
                  <span className="rounded-full bg-rose-500 px-2.5 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wider">Vencida</span>
                ) : (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[10.5px] font-bold">vence {formatDate(f.vencimento)}</span>
                )}
              </div>
              <p className="relative mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">{f.cartao}</p>
              <p className="relative text-2xl font-black tabular-nums">{formatCurrency(f.falta)}</p>
              {vencida && <p className="relative mt-0.5 text-[11.5px] text-white/80">venceu em {formatDate(f.vencimento)}</p>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
