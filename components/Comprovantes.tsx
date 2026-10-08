"use client";

// Lista os comprovantes guardados de uma locação ou de uma taxa de reserva
// (pasta "comprovantes" do Storage, ver lib/comprovante.ts) e deixa anexar
// mais um à mão, da galeria ou de um PDF.

import { useCallback, useEffect, useRef, useState } from "react";
import { Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { PASTA_COMPROVANTES, enviarComprovante } from "@/lib/comprovante";

interface Item {
  nome: string;
  link: string;
  quando: string;
}

function rotuloDoNome(nome: string): string {
  // Nome do arquivo: 2026-10-08T14-03-22-123Z.jpg
  const m = nome.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/);
  if (!m) return nome;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00Z`);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Comprovantes({ pasta, titulo = "Comprovantes" }: { pasta: string; titulo?: string }) {
  const supabase = createClient();
  const [itens, setItens] = useState<Item[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.storage
      .from(PASTA_COMPROVANTES)
      .list(pasta, { sortBy: { column: "name", order: "desc" } });
    const arquivos = (data ?? []).filter((f) => f.id);
    if (arquivos.length === 0) {
      setItens([]);
      setCarregando(false);
      return;
    }
    const { data: assinados } = await supabase.storage
      .from(PASTA_COMPROVANTES)
      .createSignedUrls(arquivos.map((f) => `${pasta}/${f.name}`), 3600);
    setItens(
      arquivos.map((f, i) => ({
        nome: f.name,
        link: assinados?.[i]?.signedUrl ?? "",
        quando: rotuloDoNome(f.name),
      }))
    );
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pasta]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function anexar(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      const { ok } = await enviarComprovante(supabase, pasta, arquivo);
      if (!ok) setErro("Não foi possível guardar o comprovante.");
      await carregar();
    } catch {
      setErro("Não foi possível guardar o comprovante.");
    } finally {
      setEnviando(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">{titulo}</p>
        <button
          type="button"
          disabled={enviando}
          onClick={() => entrada.current?.click()}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-teal disabled:opacity-60"
        >
          <Paperclip size={12} />
          {enviando ? "Enviando..." : "Anexar"}
        </button>
      </div>
      <input
        ref={entrada}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => anexar(e.target.files?.[0])}
      />
      {carregando ? (
        <p className="mt-1 text-[11px] text-neutral-400">Carregando...</p>
      ) : itens.length === 0 ? (
        <p className="mt-1 text-[11px] text-neutral-400">
          Nenhum. No WhatsApp, toque no comprovante, Compartilhar e escolha Harmonize.
        </p>
      ) : (
        <ul className="mt-1 space-y-1">
          {itens.map((it) => (
            <li key={it.nome}>
              <a
                href={it.link}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-brand-teal underline underline-offset-2"
              >
                {it.nome.endsWith(".pdf") ? "PDF" : "Foto"} de {it.quando}
              </a>
            </li>
          ))}
        </ul>
      )}
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
