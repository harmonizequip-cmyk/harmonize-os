"use client";

// Arte para a cliente divulgar o dia do HIPRO (status do WhatsApp, Instagram).
// Monta com os dados da reserva e do cadastro; tudo editável antes de mandar.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import { canvasToPngFile } from "@/lib/availability-image";
import { drawArteDivulgacao, telefoneArte, type FormatoArte } from "@/lib/arte-divulgacao";

const campo =
  "w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
const rotulo = "mb-0.5 block text-[11px] text-neutral-500";

export default function ArteDivulgacaoModal({
  clientId,
  dataInicio,
  dataFim,
  onClose,
}: {
  clientId: string;
  dataInicio: string;
  dataFim?: string | null;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [carregado, setCarregado] = useState(false);
  const [cliente, setCliente] = useState<{ name: string; whatsapp: string | null; treatment: string | null; display_name: string | null } | null>(null);
  const [formato, setFormato] = useState<FormatoArte>("story");
  const [titulo, setTitulo] = useState("Dia de HIPRO");
  const [subtitulo, setSubtitulo] = useState("Ultrassom microfocado (HIFU)");
  const [local, setLocal] = useState("");
  const [cidade, setCidade] = useState("");
  const [chamada, setChamada] = useState("Vagas limitadas. Agende o seu horário!");
  const [contato, setContato] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("name, clinic_name, city, state, whatsapp, treatment, display_name")
        .eq("id", clientId)
        .maybeSingle();
      if (data) {
        setCliente(data as any);
        setLocal((data.clinic_name as string | null)?.trim() || (data.name as string));
        setCidade([data.city, data.state].filter(Boolean).join(" - "));
        setContato(telefoneArte(data.whatsapp as string | null));
      }
      setCarregado(true);
    })();
  }, [clientId]); // eslint-disable-line react-hooks/exhaustive-deps

  const previa = useMemo(() => {
    if (!carregado || typeof document === "undefined") return null;
    return drawArteDivulgacao({ titulo, subtitulo, dataInicio, dataFim, local, cidade, chamada, contato }, formato).toDataURL("image/png");
  }, [carregado, titulo, subtitulo, dataInicio, dataFim, local, cidade, chamada, contato, formato]);

  const mensagem = `${saudacaoCurta({ name: cliente?.name, treatment: cliente?.treatment, displayName: cliente?.display_name })} 😊\n\nPara ajudar a lotar a sua agenda do dia do HIPRO, preparei esta arte para você postar no status e no Instagram. Quanto mais pacientes agendados, melhor aproveitamos o dia!`;

  async function compartilhar() {
    setEnviando(true);
    try {
      const canvas = drawArteDivulgacao({ titulo, subtitulo, dataInicio, dataFim, local, cidade, chamada, contato }, formato);
      const arquivo = await canvasToPngFile(canvas, `arte-hipro-${dataInicio}.png`);
      if ("canShare" in navigator && navigator.canShare({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], text: mensagem });
          setEnviando(false);
          return;
        } catch (e) {
          if ((e as Error)?.name === "AbortError") {
            setEnviando(false);
            return;
          }
        }
      }
      // Sem Compartilhar com arquivo: baixa a imagem e abre a conversa.
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = arquivo.name;
      a.click();
      const link = buildWhatsAppLink(cliente?.whatsapp ?? null, mensagem);
      if (link) window.open(link, "_blank");
    } finally {
      setEnviando(false);
    }
  }

  // Portal: a janela da reserva usa desfoque (backdrop-filter), que prenderia
  // esta janela dentro dela.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Arte para divulgar</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-neutral-400">
            <X size={20} />
          </button>
        </div>
        <p className="mb-3 text-xs text-neutral-500 dark:text-neutral-400">
          A cliente posta no status e no Instagram para encher a agenda do dia. Sem a marca da Harmonize.
        </p>

        <div className="mb-3 flex rounded-lg bg-neutral-100 p-0.5 text-xs dark:bg-neutral-800">
          {(
            [
              ["story", "Status / Story"],
              ["feed", "Feed"],
            ] as const
          ).map(([f, nome]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormato(f)}
              className={`flex-1 rounded-md py-1.5 font-medium ${
                formato === f ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100" : "text-neutral-500"
              }`}
            >
              {nome}
            </button>
          ))}
        </div>

        {previa ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previa} alt="Prévia da arte" className={`mx-auto rounded-xl shadow ${formato === "story" ? "w-1/2" : "w-2/3"}`} />
        ) : (
          <p className="py-10 text-center text-xs text-neutral-400">Montando...</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={rotulo}>Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={campo} />
          </div>
          <div className="col-span-2">
            <label className={rotulo}>Subtítulo</label>
            <input value={subtitulo} onChange={(e) => setSubtitulo(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={rotulo}>Clínica</label>
            <input value={local} onChange={(e) => setLocal(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={rotulo}>Cidade</label>
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} />
          </div>
          <div className="col-span-2">
            <label className={rotulo}>Chamada</label>
            <input value={chamada} onChange={(e) => setChamada(e.target.value)} className={campo} />
          </div>
          <div className="col-span-2">
            <label className={rotulo}>WhatsApp para agendar (o da clínica)</label>
            <input value={contato} onChange={(e) => setContato(e.target.value)} placeholder="deixe em branco para tirar" className={campo} />
          </div>
        </div>

        <button
          type="button"
          disabled={!previa || enviando}
          onClick={compartilhar}
          className="mt-4 w-full rounded-xl bg-brand-teal py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {enviando ? "Preparando..." : "💬 Mandar para a cliente"}
        </button>
      </div>
    </div>,
    document.body
  );
}
