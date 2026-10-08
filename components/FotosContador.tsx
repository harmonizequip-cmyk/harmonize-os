"use client";

// Fotos do visor do HIPRO, guardadas na pasta privada "fotos-contador" do
// Storage: <id do evento>/entrega.jpg e <id do evento>/busca.jpg. Servem de
// prova da contagem se o cliente questionar os disparos. A foto é reduzida
// no aparelho antes de subir (lib/foto.ts).

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reduzirFoto } from "@/lib/foto";

const PASTA = "fotos-contador";

type Momento = "entrega" | "busca";

const ROTULOS: Record<Momento, string> = {
  entrega: "Na entrega",
  busca: "Na busca",
};

export default function FotosContador({ eventId }: { eventId: string }) {
  const supabase = createClient();
  const [links, setLinks] = useState<Partial<Record<Momento, string>>>({});
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState<Momento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const entradas = { entrega: useRef<HTMLInputElement>(null), busca: useRef<HTMLInputElement>(null) };

  const carregar = useCallback(async () => {
    const { data } = await supabase.storage.from(PASTA).list(eventId);
    const novos: Partial<Record<Momento, string>> = {};
    for (const momento of ["entrega", "busca"] as Momento[]) {
      const arquivo = data?.find((f) => f.name === `${momento}.jpg`);
      if (!arquivo) continue;
      const { data: assinado } = await supabase.storage
        .from(PASTA)
        .createSignedUrl(`${eventId}/${momento}.jpg`, 3600);
      // O carimbo de data evita que o navegador mostre a foto antiga
      // depois de trocar.
      if (assinado) novos[momento] = `${assinado.signedUrl}&v=${encodeURIComponent(arquivo.updated_at ?? "")}`;
    }
    setLinks(novos);
    setCarregando(false);
    // supabase é recriado a cada render; só o evento importa aqui.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function enviar(momento: Momento, arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(momento);
    setErro(null);
    try {
      const foto = await reduzirFoto(arquivo);
      const { error } = await supabase.storage
        .from(PASTA)
        .upload(`${eventId}/${momento}.jpg`, foto, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      await carregar();
    } catch {
      setErro("Não foi possível guardar a foto. Tente de novo.");
    } finally {
      setEnviando(null);
      const entrada = entradas[momento].current;
      if (entrada) entrada.value = "";
    }
  }

  async function apagar(momento: Momento) {
    if (!window.confirm(`Apagar a foto ${ROTULOS[momento].toLowerCase()}?`)) return;
    setErro(null);
    const { error } = await supabase.storage.from(PASTA).remove([`${eventId}/${momento}.jpg`]);
    if (error) {
      setErro("Não foi possível apagar a foto.");
      return;
    }
    await carregar();
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">Foto do contador</p>
      <p className="mb-2 text-[11px] text-neutral-400">
        Fotografe o visor do equipamento. Fica guardada como prova dos disparos.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["entrega", "busca"] as Momento[]).map((momento) => (
          <div key={momento} className="min-w-0">
            <p className="mb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">{ROTULOS[momento]}</p>
            {links[momento] ? (
              <a href={links[momento]} target="_blank" rel="noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={links[momento]}
                  alt={`Contador ${ROTULOS[momento].toLowerCase()}`}
                  className="aspect-[4/3] w-full rounded-lg object-cover"
                />
              </a>
            ) : (
              <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-neutral-100 text-[11px] text-neutral-400 dark:bg-neutral-800">
                {carregando ? "Carregando..." : "Sem foto"}
              </div>
            )}
            <input
              ref={entradas[momento]}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => enviar(momento, e.target.files?.[0])}
            />
            <div className="mt-1 flex items-center gap-2">
              <button
                type="button"
                disabled={enviando !== null}
                onClick={() => entradas[momento].current?.click()}
                className="inline-flex items-center gap-1 rounded-lg bg-brand-teal px-2 py-1.5 text-[11px] font-medium text-white disabled:opacity-60"
              >
                <Camera size={12} />
                {enviando === momento ? "Enviando..." : links[momento] ? "Trocar" : "Fotografar"}
              </button>
              {links[momento] && (
                <button
                  type="button"
                  disabled={enviando !== null}
                  onClick={() => apagar(momento)}
                  className="text-[11px] text-neutral-500 underline underline-offset-2"
                >
                  apagar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
