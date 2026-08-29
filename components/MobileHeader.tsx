"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function MobileHeader() {
  const router = useRouter();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-2.5 md:hidden">
      <img src="/harmonize-logo.png" alt="Harmonize" className="h-7 w-auto" />
      <button onClick={handleLogout} className="text-sm text-neutral-500">
        Sair
      </button>
    </header>
  );
}
