"use client";

// "Mandar orientações ao paciente": abre o WhatsApp do paciente com os
// cuidados depois da sessão já escritos (lib/orientacoes-pos.ts). Nada sai
// sozinho. Sem WhatsApp no cadastro do paciente, o botão fica apagado com o
// motivo e sobra "Copiar texto".

import { Copy, MessageCircle } from "lucide-react";
import { avisar } from "@/components/Dialogos";
import { buildWhatsAppLink } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { mensagemOrientacoesPos } from "@/lib/orientacoes-pos";

export default function BotaoOrientacoes({
  paciente,
  whatsapp,
  profissional,
  retorno,
  compacto = false,
}: {
  paciente: string;
  whatsapp: string | null | undefined;
  profissional?: string | null;
  retorno?: string | null;
  /** Versão pequena (dentro da sessão na ficha do paciente). */
  compacto?: boolean;
}) {
  const texto = () => mensagemOrientacoesPos({ paciente, profissional, retorno, hoje: hojeLocal() });
  const link = whatsapp ? buildWhatsAppLink(whatsapp, texto()) : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto());
      avisar("Texto das orientações copiado.");
    } catch {
      avisar("Não consegui copiar neste aparelho.", "erro");
    }
  }

  const tam = compacto ? "min-h-9 px-3 text-[11px]" : "min-h-10 px-4 text-xs";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-600 font-bold text-white ${tam}`}>
          <MessageCircle size={14} /> Mandar orientações ao paciente
        </a>
      ) : (
        <span className={`inline-flex cursor-not-allowed items-center gap-1.5 rounded-full bg-neutral-100 font-bold text-neutral-400 ${tam}`} title="Paciente sem WhatsApp no cadastro">
          <MessageCircle size={14} /> Mandar orientações ao paciente
        </span>
      )}
      <button type="button" onClick={copiar} className={`inline-flex items-center gap-1.5 rounded-full bg-white font-semibold text-neutral-700 ring-1 ring-neutral-200 ${tam}`}>
        <Copy size={13} /> Copiar texto
      </button>
      {!link && <span className="w-full text-[11px] text-neutral-500">Paciente sem WhatsApp no cadastro: copie o texto ou cadastre o WhatsApp na ficha.</span>}
    </div>
  );
}
