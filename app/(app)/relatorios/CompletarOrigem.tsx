"use client";

// Completa a origem de quem já alugou e está sem ela. São esses cadastros
// que dizem qual canal traz quem fecha; os leads antigos que nunca alugaram
// não mudam a conclusão e ficam de fora. Um toque grava e a pessoa some.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ORIGENS } from "@/app/(app)/funil/NovoLeadModal";

export default function CompletarOrigem({ clientes }: { clientes: { id: string; name: string }[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [restantes, setRestantes] = useState(clientes);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (clientes.length === 0) return null;

  async function marcar(id: string, origem: string) {
    setSalvando(id);
    setErro(null);
    const { error } = await supabase.from("clients").update({ origem }).eq("id", id);
    setSalvando(null);
    if (error) {
      setErro("Não consegui salvar. Tente de novo.");
      return;
    }
    setRestantes((r) => r.filter((c) => c.id !== id));
    router.refresh();
  }

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
      {restantes.length === 0 ? (
        <p className="text-xs font-medium text-brand-teal">Pronto: todos os clientes que já alugaram têm origem.</p>
      ) : (
        <>
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            {restantes.length} {restantes.length === 1 ? "cliente que já alugou está" : "clientes que já alugaram estão"} sem
            origem. Toque em como cada um chegou:
          </p>
          <ul className="mt-2 space-y-2">
            {restantes.map((c) => (
              <li key={c.id}>
                <p className="truncate text-xs text-neutral-800 dark:text-neutral-200">{c.name}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ORIGENS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      disabled={salvando === c.id}
                      onClick={() => marcar(c.id, o.value)}
                      className="rounded-full border border-brand-teal px-2.5 py-1 text-[11px] text-brand-teal disabled:opacity-50"
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
