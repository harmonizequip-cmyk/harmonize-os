"use client";

import { useState } from "react";
import { canvasToPngFile } from "@/lib/availability-image";
import { drawCalculoImage, type DadosImagemCalculo } from "@/lib/calculo-image";
import { buildWhatsAppLink } from "@/lib/format";

/**
 * Botão "Gerar imagem do cálculo": desenha o cálculo dos disparos numa única
 * imagem (mesmo estilo da tela) e deixa compartilhar ou baixar. No celular
 * abre o compartilhamento nativo com a imagem anexada; onde não existe,
 * baixa a imagem e abre a conversa do cliente no WhatsApp para anexá-la (o
 * WhatsApp não aceita anexo por link).
 */
export default function CalculoImagemBotao({
  dados,
  whatsapp,
  classeBotao,
}: {
  dados: DadosImagemCalculo | null;
  whatsapp?: string | null;
  classeBotao?: string;
}) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nota, setNota] = useState<string | null>(null);

  if (!dados) return null;

  const nomeArquivo = `calculo-${(dados.cliente ?? "cliente").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30)}-${dados.dataEvento ?? "hoje"}.png`;

  async function gerar() {
    if (!dados) return;
    setGerando(true);
    setErro(null);
    setNota(null);
    try {
      const canvas = await drawCalculoImage(dados);
      setArquivo(await canvasToPngFile(canvas, nomeArquivo));
      setPrevia(canvas.toDataURL("image/png"));
    } catch {
      setErro("Não consegui gerar a imagem. Tente de novo.");
    }
    setGerando(false);
  }

  function baixar() {
    if (!previa) return;
    const link = document.createElement("a");
    link.href = previa;
    link.download = nomeArquivo;
    link.click();
  }

  async function compartilhar() {
    if (!arquivo) return;
    const podeCompartilharArquivo =
      typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare({ files: [arquivo] });
    if (podeCompartilharArquivo) {
      try {
        await navigator.share({ files: [arquivo], title: "Cálculo dos disparos" });
        return;
      } catch {
        // Cancelou o compartilhamento nativo: cai no plano B.
      }
    }
    baixar();
    const link = buildWhatsAppLink(whatsapp ?? null, "Segue o cálculo dos disparos para conferência. 😊");
    if (link) {
      window.open(link, "_blank");
      setNota("Baixei a imagem e abri a conversa no WhatsApp. Falta só anexar a imagem que acabou de baixar.");
    } else {
      setNota("Baixei a imagem. Envie pelo WhatsApp anexando o arquivo.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={gerar}
        disabled={gerando}
        className={
          classeBotao ??
          "w-full rounded-xl border border-brand-teal py-2 text-sm font-medium text-brand-teal disabled:opacity-60"
        }
      >
        {gerando ? "Gerando imagem..." : "🖼️ Gerar imagem do cálculo"}
      </button>
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}

      {previa && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => setPrevia(null)}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 shadow-2xl dark:bg-neutral-900 sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previa} alt="Cálculo dos disparos" className="mx-auto w-full rounded-xl border border-neutral-200" />
            {nota && <p className="mt-2 text-xs text-neutral-500">{nota}</p>}
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={compartilhar}
                className="rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white"
              >
                Compartilhar (WhatsApp)
              </button>
              <button
                type="button"
                onClick={baixar}
                className="rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
              >
                Baixar imagem
              </button>
              <button type="button" onClick={() => setPrevia(null)} className="py-1.5 text-xs text-neutral-500 underline">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
