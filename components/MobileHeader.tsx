"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import { LogOut } from "lucide-react";

export default function MobileHeader() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-white/50 bg-white/75 px-4 py-2 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/70 md:hidden">
      <div className="w-fit">
        <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-8 w-auto dark:hidden" />
        <img
          src="/harmonize-logo-full-dark.png"
          alt="Harmonize"
          className="hidden h-8 w-auto dark:block"
        />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle compact className="h-8 w-8" />
        <button
          onClick={handleLogout}
          aria-label="Sair"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <LogOut size={18} strokeWidth={1.75} />
        </button>
      </div>
    </header>
  );
}
