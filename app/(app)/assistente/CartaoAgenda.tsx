"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink } from "@/lib/format";
import { gerarImagensAgenda } from "@/lib/agenda-imagens";
import type { AgendaPedida, ItemAgenda } from "@/lib/assistente";
import { Check, ImageIcon, MessageCircle, Send } from "lucide-react";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function quandoFoi(iso: string | null): string {
  if (!iso) return "nunca recebeu a agenda";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "recebeu hoje";
  if (dias === 1) return "recebeu ontem";
  return `recebeu há ${dias} dias`;
}

function Linha({
  item,
  agenda,
  arquivos,
}: {
  item: ItemAgenda;
  agenda: AgendaPedida;
  arquivos: File[] | null;
}) {
  const supabase = createClient();
  const [texto, setTexto] = useState(item.texto);
  const [enviado, setEnviado] = useState<boolean>(() =>
    item.ultimo_envio ? Date.now() - new Date(item.ultimo_envio).getTime() < 12 * 3600 * 1000 : false
  );
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const link = buildWhatsAppLink(item.telefone, texto);

  // Compartilhar abre a lista do celular: escolha WhatsApp e a conversa dela.
  // O link direto do WhatsApp não aceita imagem, por isso os dois caminhos.
  async function enviarComImagem() {
    setAviso(null);
    if (!arquivos?.length) {
      setAviso("A imagem ainda está sendo gerada.");
      return;
    }
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: arquivos })) {
      try {
        try {
          await navigator.clipboard.writeText(texto);
        } catch {
          // sem permissão de copiar: segue só com o compartilhar
        }
        await navigator.share({ files: arquivos, text: texto });
        setAviso(`Escolha o WhatsApp e a conversa de ${item.nome}. A mensagem também foi copiada, caso o WhatsApp não a leve junto.`);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setAviso("Não consegui abrir o compartilhar. Use o botão do WhatsApp só com texto.");
      }
      return;
    }
    setAviso("Este aparelho não compartilha imagem por aqui. Use o botão do WhatsApp só com texto.");
  }

  async function marcarEnviado() {
    setSalvando(true);
    setAviso(null);
    const { error } = await supabase.rpc("registrar_envio_agenda", {
      p_client_id: item.client_id,
      p_mensagem: texto,
      p_inicio: agenda.inicio,
      p_fim: agenda.fim,
    });
    setSalvando(false);
    if (error) {
      setAviso(error.message || "Não consegui registrar. Tente de novo.");
      return;
    }
    setEnviado(true);
  }

  return (
    <div className={`rounded-xl border p-3 ${enviado ? "border-emerald-200 bg-emerald-50/60" : "border-neutral-200 bg-white"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-semibold text-neutral-900">{item.nome}</p>
        <p className="flex-shrink-0 text-[11px] text-neutral-400">{enviado ? "✓ enviado" : quandoFoi(item.ultimo_envio)}</p>
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        className="mt-2 w-full resize-y rounded-lg border border-neutral-200 bg-white/70 px-2.5 py-2 text-[13px] text-neutral-800"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          onClick={enviarComImagem}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={!arquivos}
        >
          <Send size={13} /> Enviar com imagem
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700"
          >
            <MessageCircle size={13} /> Só texto
          </a>
        )}
        {!enviado && (
          <button
            onClick={marcarEnviado}
            disabled={salvando}
            className="flex items-center gap-1.5 rounded-lg border border-brand-teal/40 bg-brand-teal/10 px-3 py-2 text-xs font-semibold text-brand-teal-dark disabled:opacity-50"
          >
            <Check size={13} /> {salvando ? "Salvando..." : "Marcar enviado"}
          </button>
        )}
      </div>
      {aviso && <p className="mt-2 text-[11px] text-neutral-500">{aviso}</p>}
    </div>
  );
}

export default function CartaoAgenda({ agenda }: { agenda: AgendaPedida }) {
  const supabase = createClient();
  const [arquivos, setArquivos] = useState<File[] | null>(null);
  const [previas, setPrevias] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    gerarImagensAgenda(supabase, agenda.inicio, agenda.fim)
      .then((r) => {
        if (!ativo) return;
        setArquivos(r.arquivos);
        setPrevias(r.previas);
      })
      .catch(() => ativo && setErro("Não consegui gerar a imagem da agenda."));
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agenda.inicio, agenda.fim]);

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-teal-dark">
          <ImageIcon size={14} /> Agenda de {dataBr(agenda.inicio)} a {dataBr(agenda.fim)} · {agenda.itens.length}{" "}
          {agenda.itens.length === 1 ? "cliente" : "clientes"}
        </p>
        {previas.length > 0 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {previas.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt="Imagem das datas livres" className="h-40 w-auto flex-shrink-0 rounded-lg border border-white shadow-sm" />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-neutral-500">{erro ?? "Gerando a imagem das datas livres..."}</p>
        )}
      </div>
      {agenda.itens.map((item) => (
        <Linha key={item.client_id} item={item} agenda={agenda} arquivos={arquivos} />
      ))}
    </div>
  );
}
