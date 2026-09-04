"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";

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
      <div className="w-fit rounded-lg bg-white p-1">
        <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-8 w-auto" />
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle className="px-2 py-1.5" />
        <button onClick={handleLogout} className="px-2 py-1.5 text-sm text-neutral-500 dark:text-neutral-400">
          Sair
        </button>
      </div>
    </header>
  );
}
