"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

// Some para quem tem acesso só de visualização.
export default function BotaoNovaCampanha() {
  const somenteLeitura = useSomenteLeitura();
  if (somenteLeitura) return null;
  return (
    <Link
      href="/campanhas/nova"
      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-teal py-3 text-sm font-bold text-white shadow-glow-teal active:scale-[0.99]"
    >
      <Plus size={18} /> Nova campanha
    </Link>
  );
}
