"use client";

// Arte da tabela de preços do HIPRO, com os valores de Configurações.
// Abre pelo "+" e pelo cartão do cliente no Funil (já com a mensagem
// para aquele cliente). Desenho em lib/tabela-precos-arte.ts.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { fetchSettings } from "@/lib/settings";
import { drawTabelaPrecos } from "@/lib/tabela-precos-arte";
import { saudacaoCurta } from "@/lib/saudacao";
import { buildWhatsAppLink } from "@/lib/format";

export default function TabelaPrecosModal({
  clientName,
  treatment,
  displayName,
  whatsapp,
  onClose,
}: {
  clientName?: string | null;
  treatment?: string | null;
  displayName?: string | null;
  whatsapp?: string | null;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nota, setNota] = useState<string | null>(null);
  const [montado, setMontado] = useState(false);

  const mensagem =
    `${saudacaoCurta({ name: clientName, treatment, displayName })}\n` +
    `Segue a nossa tabela de preços do HIPRO. ✨\n\n` +
    `Qualquer dúvida, estou à disposição para te ajudar a planejar o seu dia!`;

  useEffect(() => {
    setMontado(true);
    let ativo = true;
    (async () => {
      const settings = await fetchSettings(createClient());
      const logo = new Image();
      await new Promise<void>((ok) => {
        logo.onload = () => ok();
        logo.onerror = () => ok();
        logo.src = "/harmonize-logo-full.png";
      });
      if (!ativo) return;
      const canvas = drawTabelaPrecos(settings.pricing, settings.reservationFee, logo.complete && logo.naturalWidth ? logo : null);
      setUrl(canvas.toDataURL("image/png"));
      canvas.toBlob((b) => {
        if (b && ativo) setArquivo(new File([b], "tabela-precos-hipro-harmonize.png", { type: "image/png" }));
      }, "image/png");
    })();
    return () => {
      ativo = false;
    };
  }, []);

  function baixar() {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "tabela-precos-hipro-harmonize.png";
    a.click();
  }

  async function mandar() {
    if (!arquivo) return;
    if ("canShare" in navigator && navigator.canShare({ files: [arquivo] })) {
      try {
        await navigator.share({ files: [arquivo], text: mensagem, title: "Tabela de preços HIPRO" });
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    baixar();
    const link = buildWhatsAppLink(whatsapp, mensagem);
    if (link) {
      window.open(link, "_blank");
      setNota("Baixei a imagem e abri a conversa com a mensagem pronta. Falta só anexar a imagem.");
    } else {
      setNota("Baixei a imagem. Mande pelo WhatsApp junto com a mensagem abaixo.");
    }
  }

  if (!montado) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-neutral-900">
          Tabela de preços{clientName ? ` para ${clientName}` : ""}
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          Os valores vêm de Configurações: mudou lá, a arte já sai atualizada.
        </p>
        {url ? (
          <img src={url} alt="Tabela de preços do HIPRO" className="w-full rounded-xl border border-neutral-200" />
        ) : (
          <p className="py-10 text-center text-sm text-neutral-400">Montando a arte...</p>
        )}
        <p className="mt-3 whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
          {mensagem}
        </p>
        {nota && <p className="mt-2 text-xs text-brand-teal">{nota}</p>}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={baixar}
            disabled={!url}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 disabled:opacity-50"
          >
            Baixar imagem
          </button>
          <button
            type="button"
            onClick={mandar}
            disabled={!arquivo}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Mandar
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-2 w-full py-2 text-xs text-neutral-400 underline">
          Fechar
        </button>
      </div>
    </div>,
    document.body
  );
}
