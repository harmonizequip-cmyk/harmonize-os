"use client";

import { createClient } from "@/lib/supabase/client";

export default function SairBotao() {
  return (
    <button
      type="button"
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.href = "/login";
      }}
      className="w-full rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-600 ring-1 ring-neutral-200"
    >
      Sair
    </button>
  );
}
