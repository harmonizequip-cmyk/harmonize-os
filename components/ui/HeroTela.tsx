import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Destaque escuro do topo das telas da Harmonize (pedido do dono, 19/10/2026):
 * mesmo desenho do "Meu dinheiro" do Pessoal e do destaque do mês do Dashboard,
 * no verde-turquesa da borboleta. Uma tela usa este cartão para o número que
 * mais importa nela; o resto (filtros, listas) fica logo abaixo.
 *
 * - `anel`: opcional, 0 a 1 (fração preenchida) com rótulo curto no meio.
 * - `chips`: fatos rápidos em pílulas (cada um com ícone opcional).
 * - `tom`: cor do número e do anel quando há alerta ("ok" turquesa, "alerta" âmbar, "ruim" rosa).
 */
export interface ChipHero {
  texto: string;
  icone?: LucideIcon;
  tom?: "neutro" | "bom" | "ruim";
}

export default function HeroTela({
  etiqueta,
  rotulo,
  valor,
  apoio,
  anel,
  tom = "ok",
  chips = [],
  children,
}: {
  etiqueta: string;
  rotulo: string;
  valor: ReactNode;
  apoio?: ReactNode;
  anel?: { fracao: number; texto: string; legenda: string };
  tom?: "ok" | "alerta" | "ruim";
  chips?: ChipHero[];
  children?: ReactNode;
}) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const fracao = anel ? Math.max(0, Math.min(1, anel.fracao)) : 0;
  const corAnel = tom === "ruim" ? "#fb7185" : tom === "alerta" ? "#fbbf24" : "#5eead4";
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#05302d] via-[#0b6b63] to-[#1fae9f] p-5 text-white shadow-[0_24px_50px_-24px_rgb(13_110_100/0.9)]">
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-emerald-300/25 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" />

      <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-teal-100">{etiqueta}</p>

      <div className="relative mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-teal-100">{rotulo}</p>
          <p className="whitespace-nowrap text-[1.75rem] font-black leading-tight tabular-nums">{valor}</p>
          {apoio && <p className="mt-1 text-[12.5px] text-teal-100">{apoio}</p>}
        </div>
        {anel && (
          <div className="relative h-24 w-24 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="11" />
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={corAnel}
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - fracao)}
                style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black tabular-nums">{anel.texto}</span>
              <span className="text-[9px] font-semibold uppercase tracking-wide text-teal-100">{anel.legenda}</span>
            </div>
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="relative mt-4 flex flex-wrap gap-2">
          {chips.map((ch, i) => {
            const Icone = ch.icone;
            const cor =
              ch.tom === "bom" ? "bg-emerald-300/20 text-emerald-100" : ch.tom === "ruim" ? "bg-rose-400/20 text-rose-100" : "bg-white/15 backdrop-blur";
            return (
              <span key={i} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${cor}`}>
                {Icone && <Icone size={14} className="text-teal-200" />} {ch.texto}
              </span>
            );
          })}
        </div>
      )}
      {children && <div className="relative mt-4">{children}</div>}
    </section>
  );
}
