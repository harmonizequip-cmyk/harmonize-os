"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink } from "@/lib/format";
import { gerarImagensAgenda } from "@/lib/agenda-imagens";
import { LinkCliente } from "@/components/Atalhos";
import type { AgendaPedida, ItemAgenda } from "@/lib/assistente";
import { Check, ChevronDown, ChevronUp, ImageIcon, MessageCircle, Plus, Send } from "lucide-react";

const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

function quandoFoi(iso: string | null): string {
  if (!iso) return "nunca recebeu";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "recebeu hoje";
  if (dias === 1) return "recebeu ontem";
  return `recebeu há ${dias} dias`;
}

function Linha({
  item,
  agenda,
  arquivos,
  onEnviado,
}: {
  item: ItemAgenda;
  agenda: AgendaPedida;
  arquivos: File[] | null;
  onEnviado: () => void;
}) {
  const supabase = createClient();
  const [texto, setTexto] = useState(item.texto);
  const [aberta, setAberta] = useState(false);
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
        setAviso(`Escolha o WhatsApp e a conversa de ${item.nome}. A mensagem também foi copiada, caso o WhatsApp não a leve junto. Depois toque em Enviado.`);
      } catch (e) {
        if ((e as Error)?.name !== "AbortError") setAviso("Não consegui abrir o compartilhar. Use Só texto.");
      }
      return;
    }
    setAviso("Este aparelho não compartilha imagem por aqui. Use Só texto.");
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
    setAberta(false);
    onEnviado();
  }

  return (
    <div className={`rounded-xl border px-3 py-2.5 ${enviado ? "border-emerald-200 bg-emerald-50/60" : "border-neutral-200 bg-white"}`}>
      {/* Div em vez de botão: o nome é link para a ficha (que para o
          clique) e link não pode ficar dentro de botão. */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setAberta((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setAberta((v) => !v);
          }
        }}
        className="flex w-full cursor-pointer items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-neutral-900">
            <LinkCliente id={item.client_id}>{item.nome}</LinkCliente>
          </span>
          <span className="block text-[11px] text-neutral-400">{enviado ? "✓ enviado" : quandoFoi(item.ultimo_envio)}</span>
        </span>
        <span className="flex flex-shrink-0 items-center gap-1 text-[11px] text-neutral-500">
          {aberta ? "fechar" : "mensagem"} {aberta ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </div>
      {aberta && (
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          className="mt-2 w-full resize-y rounded-lg border border-neutral-200 bg-white/70 px-2.5 py-2 text-[13px] text-neutral-800"
        />
      )}
      {!enviado && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            onClick={enviarComImagem}
            disabled={!arquivos}
            className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Send size={13} /> Com imagem
          </button>
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-2 text-xs font-medium text-neutral-700"
            >
              <MessageCircle size={13} /> Só texto
            </a>
          ) : (
            <span />
          )}
          <button
            onClick={marcarEnviado}
            disabled={salvando}
            className="flex items-center justify-center gap-1 rounded-lg border border-brand-teal/40 bg-brand-teal/10 px-2 py-2 text-xs font-semibold text-brand-teal-dark disabled:opacity-50"
          >
            <Check size={13} /> {salvando ? "..." : "Enviado"}
          </button>
        </div>
      )}
      {aviso && <p className="mt-2 text-[11px] text-neutral-500">{aviso}</p>}
    </div>
  );
}

export default function CartaoAgenda({ agenda, onPedir }: { agenda: AgendaPedida; onPedir?: (pergunta: string) => void }) {
  const supabase = createClient();
  const [arquivos, setArquivos] = useState<File[] | null>(null);
  const [previas, setPrevias] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [verImagem, setVerImagem] = useState(false);
  const [enviados, setEnviados] = useState(
    () => agenda.itens.filter((i) => i.ultimo_envio && Date.now() - new Date(i.ultimo_envio).getTime() < 12 * 3600 * 1000).length
  );
  const mes = MESES[Number(agenda.inicio.slice(5, 7)) - 1];

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

  const total = agenda.itens.length;

  return (
    <div className="mt-2 space-y-2">
      <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-teal-dark">
            <ImageIcon size={14} /> Agenda {dataBr(agenda.inicio)} a {dataBr(agenda.fim)}
          </p>
          <p className="text-xs font-semibold text-brand-teal-dark">
            {enviados} de {total} enviados
          </p>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70">
          <div className="h-full rounded-full bg-brand-teal transition-all" style={{ width: `${total ? (enviados / total) * 100 : 0}%` }} />
        </div>
        {previas.length > 0 ? (
          <>
            <button onClick={() => setVerImagem((v) => !v)} className="mt-2 text-[11px] font-medium text-brand-teal-dark underline">
              {verImagem ? "Esconder a imagem" : "Ver a imagem que vai junto"}
            </button>
            {verImagem && (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {previas.map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={src} alt="Imagem das datas livres" className="h-48 w-auto flex-shrink-0 rounded-lg border border-white shadow-sm" />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-1.5 text-[11px] text-neutral-500">{erro ?? "Gerando a imagem das datas livres..."}</p>
        )}
      </div>
      {agenda.itens.map((item) => (
        <Linha key={item.client_id} item={item} agenda={agenda} arquivos={arquivos} onEnviado={() => setEnviados((n) => n + 1)} />
      ))}
      {onPedir && (
        <button
          onClick={() => onPedir(`Monta as próximas da agenda de ${mes}`)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-brand-teal/50 bg-white px-3 py-2.5 text-xs font-semibold text-brand-teal-dark"
        >
          <Plus size={14} /> Montar as próximas
        </button>
      )}
    </div>
  );
}
