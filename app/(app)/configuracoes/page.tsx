import Link from "next/link";
import { FlaskConical } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import ConfiguracoesClient from "./ConfiguracoesClient";

export default async function ConfiguracoesPage() {
  const supabase = createClient();

  const settings = await fetchSettings(supabase);
  const { data: tags } = await supabase.from("tags").select("id, name, color, is_automatic").order("name");

  // A porta de entrada do modo teste fica aqui em cima, e não no menu
  // principal, porque é coisa de ajuste pontual: liga, testa, desliga.
  // Quando está ligado, a faixa amarela no topo de todas as telas leva
  // direto pra lá, então não depende deste link pra achar o caminho.
  return (
    <div className="space-y-6">
      <Link
        href="/configuracoes/dados-teste"
        className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition hover:border-brand-teal dark:border-neutral-800 dark:bg-neutral-900"
      >
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <FlaskConical size={17} strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-neutral-900 dark:text-neutral-100">Dados de teste</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Ligar o modo teste, marcar o que é teste e limpar depois
          </span>
        </span>
      </Link>

      <ConfiguracoesClient initialSettings={settings} initialTags={tags ?? []} />
    </div>
  );
}
