import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { fetchPreferencias } from "@/lib/settings";
import { carregarRelacionamento } from "@/lib/carregar-relacionamento";
import { carregarCampanha } from "@/lib/carregar-campanhas";
import { FaltaSql } from "../comum";
import EditorCampanha from "../EditorCampanha";

// Nova campanha: o mesmo editor da página da campanha, ainda sem envios.
export const dynamic = "force-dynamic";

export default async function NovaCampanhaPage() {
  const supabase = createClient();
  const r = await carregarCampanha(supabase, null);
  const voltar = (
    <Link href="/campanhas" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500">
      <ChevronLeft size={16} /> Campanhas
    </Link>
  );
  if (r.faltaSql) {
    return (
      <div className="space-y-4">
        {voltar}
        <FaltaSql />
      </div>
    );
  }
  const { relacionamento: cfg } = await fetchPreferencias(supabase);
  const pessoas = await carregarRelacionamento(supabase, hojeLocal(), cfg);
  return (
    <div className="space-y-4">
      {voltar}
      <h1 className="px-1 text-lg font-bold text-neutral-900">Nova campanha</h1>
      <EditorCampanha campanha={null} arteUrl={null} pessoas={pessoas} jaNaCampanha={[]} naoQuer={r.naoQuer} />
    </div>
  );
}
