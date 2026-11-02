"use client";

// "Mandar ficha assinada ao paciente": gera no aparelho o PDF da ficha daquela
// sessão (com as assinaturas, a triagem e a conferência) e abre o Compartilhar
// do celular, para escolher o WhatsApp do paciente. Nada sai sozinho. Se o
// aparelho não compartilha arquivo, baixa o PDF e abre a conversa do paciente
// com o texto, para anexar pelo clipe.

import { useState } from "react";
import { FileCheck2, Loader2, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/Dialogos";
import { buildWhatsAppLink } from "@/lib/format";
import { usePreferencias } from "@/lib/usar-preferencias";
import type { Plano } from "@/lib/planejador";
import type { AssinaturaSessao } from "@/lib/assinatura-sessao";
import { paraImpressao } from "@/lib/assinaturas-envio";
import { dadosFichaAssinada, mensagemFichaAssinada, nomeArquivoFicha } from "@/lib/ficha-assinada";

function baixar(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement("a");
  a.href = url;
  a.download = arquivo.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export default function EnviarFichaAssinada({
  plano,
  sessao,
  assinaturas,
  hashAtual,
  whatsapp,
}: {
  plano: Plano;
  sessao: number;
  assinaturas: AssinaturaSessao[];
  hashAtual: string | null;
  whatsapp?: string | null;
}) {
  const prefs = usePreferencias();
  const [gerando, setGerando] = useState(false);
  // Pronto mas o celular pediu um toque novo para abrir o Compartilhar.
  const [pronto, setPronto] = useState<File | null>(null);
  const texto = mensagemFichaAssinada(plano.paciente, sessao, plano.sessoesTotal);

  async function compartilhar(arquivo: File): Promise<"ok" | "toque" | "sem"> {
    const dados = { files: [arquivo], text: texto, title: arquivo.name };
    if (!navigator.share || !navigator.canShare?.(dados)) return "sem";
    try {
      await navigator.share(dados);
      return "ok";
    } catch (e) {
      const nome = (e as Error)?.name;
      if (nome === "AbortError") return "ok";
      if (nome === "NotAllowedError") return "toque";
      return "sem";
    }
  }

  function semCompartilhar(arquivo: File) {
    baixar(arquivo);
    const link = buildWhatsAppLink(whatsapp, texto);
    if (link) window.open(link, "_blank");
    avisar(link ? "PDF baixado. Na conversa do paciente, anexe o arquivo pelo clipe." : "PDF baixado. Mande o arquivo ao paciente pelo WhatsApp.");
  }

  async function enviar() {
    if (pronto) {
      const r = await compartilhar(pronto);
      if (r === "sem") semCompartilhar(pronto);
      if (r !== "toque") setPronto(null);
      return;
    }
    setGerando(true);
    try {
      const sb = createClient();
      const lista = await paraImpressao(sb, assinaturas);
      const f = dadosFichaAssinada(plano, sessao, lista, hashAtual);
      const { gerarFichaAssinadaPdf } = await import("@/lib/ficha-assinada-pdf");
      const blob = await gerarFichaAssinadaPdf(f, `${window.location.origin}/harmonize-logo-full.png`, prefs.empresa.rodapeDocumentos.trim());
      const arquivo = new File([blob], nomeArquivoFicha(plano.paciente, sessao), { type: "application/pdf" });
      const r = await compartilhar(arquivo);
      if (r === "toque") setPronto(arquivo);
      else if (r === "sem") semCompartilhar(arquivo);
    } catch (e) {
      avisar((e as Error).message || "Não consegui gerar a ficha. Confira a internet.", "erro");
    } finally {
      setGerando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={enviar}
      disabled={gerando}
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-bold disabled:opacity-60 ${pronto ? "bg-brand-teal text-white" : "bg-emerald-600 text-white"}`}
    >
      {gerando ? <Loader2 size={14} className="animate-spin" /> : pronto ? <Send size={14} /> : <FileCheck2 size={14} />}
      {gerando ? "Preparando a ficha..." : pronto ? "Ficha pronta: toque para enviar" : "Mandar ficha assinada ao paciente"}
    </button>
  );
}
