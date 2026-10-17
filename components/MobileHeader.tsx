"use client";

import { usePathname, useRouter } from "next/navigation";
import { ehEspacoPessoal } from "@/lib/espaco";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import GlobalSearch from "./GlobalSearch";
import Link from "next/link";
import { LogOut, Sparkles } from "lucide-react";
import { useSomenteLeitura } from "./SomenteLeitura";

// O menu de navegação (antigo botão de hambúrguer aqui no topo) mudou para
// o último botão da BottomNav — ver components/BottomNav.tsx. Manter os
// dois ao mesmo tempo (um em cima, seis embaixo) tinha virado botão
// demais na tela; agora a barra de baixo é o único lugar de navegação.
export default function MobileHeader() {
  const router = useRouter();
  const pessoal = ehEspacoPessoal(usePathname());
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between bg-white/75 px-4 py-2.5 backdrop-blur-xl md:hidden">
      <div className="flex w-fit items-center gap-2">
        <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-8 w-auto" />
        {pessoal && (
          <span className="rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-500 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white">
            Pessoal
          </span>
        )}
        <img
          src="/harmonize-logo-full-dark.png"
          alt="Harmonize"
          className="hidden h-8 w-auto"
        />
      </div>
      <div className="flex items-center gap-1">
        {!somenteLeitura && (
          <Link
            href={pessoal ? "/pessoal/assistente" : "/assistente"}
            aria-label="Assistente"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-brand-teal-dark transition hover:bg-neutral-100"
          >
            <Sparkles size={18} strokeWidth={1.75} />
          </Link>
        )}
        <GlobalSearch compact />
        <ThemeToggle compact className="h-8 w-8" />
        <button
          onClick={handleLogout}
          aria-label="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100"
        >
          <LogOut size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
