import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { hojeLocal } from "@/lib/period";
import { fetchPreferencias } from "@/lib/settings";
import { carregarRelacionamento } from "@/lib/carregar-relacionamento";
import { PASTA_CAMPANHAS, carregarCampanha } from "@/lib/carregar-campanhas";
import { FaltaSql } from "../comum";
import CampanhaClient from "../CampanhaClient";

// Página da campanha: fila de envio um a um, resultado e editor.
export const dynamic = "force-dynamic";

export default async function CampanhaPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = createClient();
  const r = await carregarCampanha(supabase, id);
  if (r.faltaSql) {
    return (
      <div className="space-y-4">
        <Link href="/campanhas" className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500">
          <ChevronLeft size={16} /> Campanhas
        </Link>
        <FaltaSql />
      </div>
    );
  }
  if (!r.campanha) notFound();
  const hoje = hojeLocal();
  const [{ relacionamento: cfg }, arte] = await Promise.all([
    fetchPreferencias(supabase),
    r.campanha.arte_path
      ? supabase.storage.from(PASTA_CAMPANHAS).createSignedUrl(r.campanha.arte_path, 3600)
      : Promise.resolve({ data: null, error: null }),
  ]);
  const pessoas = await carregarRelacionamento(supabase, hoje, cfg);
  return (
    <CampanhaClient
      campanha={r.campanha}
      arteUrl={arte.data?.signedUrl ?? null}
      envios={r.envios}
      naoQuer={r.naoQuer}
      conversoes={r.conversoes}
      erroConversoes={r.erroConversoes}
      pessoas={pessoas}
      hoje={hoje}
      abaInicial={sp.aba}
    />
  );
}
