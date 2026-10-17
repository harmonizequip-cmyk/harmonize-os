// Peças visuais do padrão do app (aprovado pelo dono em 17/10/2026, a partir
// do Dashboard): cartão branco com sombra suave, ícone num quadradinho de cor
// clara, selo com ícone e a onda da marca no canto dos destaques.
// Use estas peças em tela nova em vez de emoji solto ou cartão de vidro.

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export type CorVisual = "teal" | "roxo" | "azul" | "ambar" | "verde" | "rosa" | "vermelho" | "cinza";

export const CORES: Record<CorVisual, { chip: string; texto: string; pilula: string; ponto: string }> = {
  teal: { chip: "bg-teal-50 text-teal-600", texto: "text-teal-700", pilula: "bg-teal-50 text-teal-700", ponto: "bg-teal-500" },
  roxo: { chip: "bg-violet-50 text-violet-600", texto: "text-violet-700", pilula: "bg-violet-50 text-violet-700", ponto: "bg-violet-500" },
  azul: { chip: "bg-sky-50 text-sky-600", texto: "text-sky-700", pilula: "bg-sky-50 text-sky-700", ponto: "bg-sky-500" },
  ambar: { chip: "bg-amber-50 text-amber-600", texto: "text-amber-700", pilula: "bg-amber-50 text-amber-700", ponto: "bg-amber-400" },
  verde: { chip: "bg-emerald-50 text-emerald-600", texto: "text-emerald-700", pilula: "bg-emerald-50 text-emerald-700", ponto: "bg-emerald-500" },
  rosa: { chip: "bg-pink-50 text-pink-600", texto: "text-pink-700", pilula: "bg-pink-50 text-pink-700", ponto: "bg-pink-500" },
  vermelho: { chip: "bg-rose-50 text-rose-600", texto: "text-rose-700", pilula: "bg-rose-50 text-rose-600", ponto: "bg-rose-500" },
  cinza: { chip: "bg-slate-100 text-slate-500", texto: "text-slate-600", pilula: "bg-slate-100 text-slate-600", ponto: "bg-slate-400" },
};

/** Ícone num quadradinho de cor clara (o "chip" dos cartões e listas). */
export function IconeChip({
  icone: Icone,
  cor = "teal",
  tamanho = "md",
  className = "",
}: {
  icone: LucideIcon;
  cor?: CorVisual;
  tamanho?: "sm" | "md" | "lg";
  className?: string;
}) {
  const t = tamanho === "lg" ? "h-12 w-12 rounded-2xl" : tamanho === "sm" ? "h-8 w-8 rounded-xl" : "h-10 w-10 rounded-2xl";
  const i = tamanho === "lg" ? 22 : tamanho === "sm" ? 16 : 19;
  return (
    <span className={`flex flex-shrink-0 items-center justify-center ${t} ${CORES[cor].chip} ${className}`}>
      <Icone size={i} strokeWidth={1.9} />
    </span>
  );
}

/** Selo arredondado, com ícone opcional. */
export function Pilula({ children, cor = "teal", icone: Icone }: { children: ReactNode; cor?: CorVisual; icone?: LucideIcon }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${CORES[cor].pilula}`}>
      {Icone && <Icone size={14} strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/** Cartão branco padrão (sombra suave, cantos bem redondos). */
export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`cartao ${className}`}>{children}</section>;
}

/** Título pequeno em caixa alta de um bloco ("PRECISA DE VOCÊ · 4"). */
export function TituloBloco({ children, extra }: { children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-neutral-600">{children}</p>
      {extra}
    </div>
  );
}

/** Onda da marca para o canto superior direito de um cartão de destaque. */
export function OndaMarca({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 120" aria-hidden className={`pointer-events-none absolute right-0 top-0 h-28 w-52 ${className}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="onda-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3DBFB8" stopOpacity="0.16" />
          <stop offset="1" stopColor="#7EC8E3" stopOpacity="0.22" />
        </linearGradient>
        <linearGradient id="onda-b" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7EC8E3" stopOpacity="0.18" />
          <stop offset="1" stopColor="#B8A0D0" stopOpacity="0.45" />
        </linearGradient>
      </defs>
      <path d="M60 0 C 110 30, 150 20, 220 95 L220 0 Z" fill="url(#onda-a)" />
      <path d="M130 0 C 165 22, 190 30, 220 60 L220 0 Z" fill="url(#onda-b)" />
    </svg>
  );
}
