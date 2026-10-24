"use client";

// Recibo: se o app oferece mandar o recibo logo depois de receber um pagamento.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import type { Preferencias } from "@/lib/preferencias";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { BarraSalvar, Bloco, Chave } from "../ui";

export default function PrefsRecibo({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = preferencias.recibo.oferecer;
  const [oferecer, setOferecer] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { recibo: { oferecer } });
    setSalvando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco titulo="Recibo">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-neutral-900">Oferecer o recibo depois de receber um pagamento</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              Ligado, o app mostra a imagem do recibo para mandar à cliente assim que o pagamento é lançado. Desligado, o pagamento é
              registrado do mesmo jeito, só não aparece a oferta. Padrão: ligado.
            </p>
          </div>
          <Chave ligada={oferecer} onChange={(v) => { setOferecer(v); setSalvo(false); setErro(null); }} rotulo="Oferecer o recibo depois de receber um pagamento" />
        </div>
      </Bloco>
      <BarraSalvar alterado={oferecer !== inicial} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setOferecer(inicial)} />
    </div>
  );
}
