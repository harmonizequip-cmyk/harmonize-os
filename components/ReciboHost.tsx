"use client";

// Depois de registrar um pagamento de locação (em qualquer tela), oferece
// mandar o recibo à cliente: monta a imagem (lib/recibo-image.ts) e abre o
// Compartilhar do celular. Fica no layout e escuta o evento que o
// ReceberPagamentoBotao dispara, porque o botão costuma sumir da tela assim
// que a locação fica paga.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { canvasToPngFile } from "@/lib/availability-image";
import { drawReciboImage, reaisRecibo, type DadosRecibo } from "@/lib/recibo-image";
import { buildWhatsAppLink, formatDate } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";

export const EVENTO_PAGAMENTO = "harmonize:pagamento-registrado";

export interface PagamentoRegistrado {
  rentalId: string;
  valor: number;
  forma: string;
  data: string;
}

const FORMAS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export function avisarPagamentoRegistrado(p: PagamentoRegistrado) {
  window.dispatchEvent(new CustomEvent<PagamentoRegistrado>(EVENTO_PAGAMENTO, { detail: p }));
}

export default function ReciboHost() {
  const supabase = createClient();
  const [pagamento, setPagamento] = useState<PagamentoRegistrado | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [whats, setWhats] = useState<{ tel: string | null; texto: string } | null>(null);

  useEffect(() => {
    const ouvir = (e: Event) => {
      setPagamento((e as CustomEvent<PagamentoRegistrado>).detail);
      setPrevia(null);
      setArquivo(null);
      setErro(null);
    };
    window.addEventListener(EVENTO_PAGAMENTO, ouvir);
    return () => window.removeEventListener(EVENTO_PAGAMENTO, ouvir);
  }, []);

  function fechar() {
    setPagamento(null);
    setPrevia(null);
    setArquivo(null);
  }

  async function gerar() {
    if (!pagamento) return;
    setGerando(true);
    setErro(null);
    try {
      const [{ data: loc, error: e1 }, { data: sit, error: e2 }] = await Promise.all([
        supabase
          .from("rentals")
          .select("event_date, event_date_end, clients(name, treatment, display_name, whatsapp), equipments(name)")
          .eq("id", pagamento.rentalId)
          .single(),
        supabase
          .from("rentals_situacao_pagamento")
          .select("calculated_value, credito_taxa, total_pago, saldo")
          .eq("rental_id", pagamento.rentalId)
          .single(),
      ]);
      if (e1 || e2 || !loc || !sit) throw new Error();
      const c = um<any>((loc as any).clients);
      const periodo =
        loc.event_date_end && loc.event_date_end !== loc.event_date
          ? `${formatDate(loc.event_date)} a ${formatDate(loc.event_date_end)}`
          : formatDate(loc.event_date);
      const dados: DadosRecibo = {
        cliente: c?.name ?? null,
        equipamento: um<any>((loc as any).equipments)?.name ?? null,
        periodo,
        valorPago: pagamento.valor,
        forma: FORMAS[pagamento.forma] ?? pagamento.forma,
        dataPagamento: pagamento.data,
        totalLocacao: Number(sit.calculated_value),
        totalPago: Number(sit.total_pago) + Number(sit.credito_taxa),
        saldo: Number(sit.saldo),
      };
      const canvas = await drawReciboImage(dados);
      setArquivo(await canvasToPngFile(canvas, `recibo-${pagamento.data}.png`));
      setPrevia(canvas.toDataURL("image/png"));
      const saudacao = saudacaoCurta({ name: c?.name, treatment: c?.treatment, displayName: c?.display_name });
      setWhats({
        tel: c?.whatsapp ?? null,
        texto:
          `${saudacao} 😊\n\nRecebi o seu pagamento de ${reaisRecibo(pagamento.valor)}. Segue o recibo.` +
          (dados.saldo > 0.009 ? ` Fica em aberto ${reaisRecibo(dados.saldo)}.` : " A locação está quitada.") +
          "\n\nObrigada! 🙏",
      });
    } catch {
      setErro("Não consegui montar o recibo. Tente de novo.");
    }
    setGerando(false);
  }

  async function compartilhar() {
    if (!arquivo || !whats) return;
    const pode = "canShare" in navigator && navigator.canShare({ files: [arquivo] });
    if (pode) {
      try {
        await navigator.share({ files: [arquivo], text: whats.texto });
        fechar();
        return;
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
      }
    }
    // Sem Compartilhar com arquivo: baixa a imagem e abre a conversa.
    if (previa) {
      const a = document.createElement("a");
      a.href = previa;
      a.download = arquivo.name;
      a.click();
    }
    const link = buildWhatsAppLink(whats.tel, whats.texto);
    if (link) window.open(link, "_blank");
  }

  if (!pagamento) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-3 sm:bottom-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-brand-teal/30 bg-white p-4 shadow-2xl dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Pagamento de {reaisRecibo(pagamento.valor)} registrado.
          </p>
          <button onClick={fechar} aria-label="Fechar" className="text-neutral-400">
            <X size={18} />
          </button>
        </div>
        {!previa ? (
          <button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="mt-3 w-full rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {gerando ? "Montando o recibo..." : "🧾 Enviar recibo para a cliente"}
          </button>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previa} alt="Recibo" className="mx-auto mt-3 max-h-[50vh] rounded-xl border border-neutral-200" />
            <button
              type="button"
              onClick={compartilhar}
              className="mt-3 w-full rounded-xl bg-brand-teal py-2.5 text-sm font-medium text-white"
            >
              Compartilhar no WhatsApp
            </button>
            <p className="mt-1 text-center text-[11px] text-neutral-400">No WhatsApp, escolha a conversa da cliente.</p>
          </>
        )}
        {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
      </div>
    </div>
  );
}
