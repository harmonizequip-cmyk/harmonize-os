"use client";

// Atalhos entre telas: um toque leva ao item ligado (cliente, atendimento,
// locação, lançamento) sem voltar para o menu. Os dois param o clique para
// não abrir também a linha/cartão onde estão. Endereços em lib/atalhos.ts.

import Link from "next/link";
import type { ReactNode } from "react";

const parar = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** Pílula de atalho: "👤 Ficha", "📅 Agenda", "💰 Lançamento"... */
export function Atalho({ href, emoji, children, title }: { href: string; emoji?: string; children: ReactNode; title?: string }) {
  return (
    <Link
      href={href}
      onClick={parar}
      title={title}
      className="inline-flex items-center gap-1 rounded-full border border-brand-teal/30 bg-brand-teal/5 px-2.5 py-1 text-[11px] font-medium text-brand-teal-dark hover:bg-brand-teal/10"
    >
      {emoji && <span aria-hidden>{emoji}</span>}
      {children}
    </Link>
  );
}

/** Fileira de atalhos (some sozinha quando não há nenhum). */
export function Atalhos({ children, className = "" }: { children: ReactNode; className?: string }) {
  const itens = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (!itens.length) return null;
  return <div className={`flex flex-wrap gap-1.5 ${className}`}>{itens}</div>;
}

/** Nome da cliente que leva à ficha dela (sem id, só o texto). */
export function LinkCliente({ id, children, className = "" }: { id?: string | null; children: ReactNode; className?: string }) {
  if (!id) return <span className={className}>{children}</span>;
  return (
    <Link href={`/clientes/${id}`} onClick={parar} className={`underline decoration-dotted underline-offset-2 hover:text-brand-teal-dark ${className}`}>
      {children}
    </Link>
  );
}
