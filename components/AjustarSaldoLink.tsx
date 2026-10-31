"use client";

// Link pequeno "Ajustar" no cartão "Saldo em caixa" do Dashboard: abre o
// Financeiro com a janela Ajustar saldo. Some no acesso só de visualização.

import Link from "next/link";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

export default function AjustarSaldoLink() {
  const somenteLeitura = useSomenteLeitura();
  if (somenteLeitura) return null;
  return (
    <Link href="/financeiro?acao=ajustar-saldo" className="text-[11px] font-medium text-brand-teal-dark">
      Ajustar
    </Link>
  );
}
