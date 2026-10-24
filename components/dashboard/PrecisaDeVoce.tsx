"use client";

// Bloco "Precisa de você" do Dashboard: todos os avisos num cartão só, os
// urgentes primeiro, em linhas curtas. Cada linha leva à lista do que avisa
// (regra do CLAUDE.md). Mostra os primeiros (4 por padrão); o resto abre em "ver mais".

import Link from "next/link";
import { useState } from "react";
import {
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  LineChart,
  PenLine,
  TrendingUp,
  Wallet,
  FileSignature,
  MessageCircle,
  PartyPopper,
  Phone,
  ReceiptText,
  UserPlus,
  Wrench,
  type LucideIcon,
  Target,
} from "lucide-react";
import { IconeChip, type CorVisual } from "@/components/ui/Visual";

export type NivelAviso = "urgente" | "atencao" | "info";

// Ícone e cor de cada tipo de aviso (padrão visual aprovado: ícone num
// quadradinho de cor clara, no lugar de emoji).
const ICONES: Record<string, { icone: LucideIcon; cor: CorVisual }> = {
  taxa: { icone: CreditCard, cor: "ambar" },
  agenda: { icone: CalendarCheck, cor: "teal" },
  disparos: { icone: ReceiptText, cor: "roxo" },
  confirmacao: { icone: Phone, cor: "azul" },
  tarefas: { icone: ClipboardCheck, cor: "verde" },
  conversa: { icone: MessageCircle, cor: "teal" },
  equipamento: { icone: Wrench, cor: "cinza" },
  cadastro: { icone: UserPlus, cor: "rosa" },
  acesso: { icone: FileSignature, cor: "rosa" },
  // Pessoal (lib/pessoal-controle.ts)
  fatura: { icone: CreditCard, cor: "roxo" },
  alta: { icone: TrendingUp, cor: "rosa" },
  saldo: { icone: Wallet, cor: "vermelho" },
  lancar: { icone: PenLine, cor: "azul" },
  projecao: { icone: LineChart, cor: "ambar" },
  orcamento: { icone: Target, cor: "ambar" },
};

export interface AvisoDash {
  id: string;
  /** Chave de ICONES. */
  icone: keyof typeof ICONES | string;
  texto: string;
  detalhe?: string;
  href: string;
  nivel: NivelAviso;
}

const ORDEM: Record<NivelAviso, number> = { urgente: 0, atencao: 1, info: 2 };
const PONTO: Record<NivelAviso, string> = {
  urgente: "bg-rose-500",
  atencao: "bg-amber-400",
  info: "bg-brand-teal",
};

export default function PrecisaDeVoce({
  avisos,
  titulo = "Precisa de você",
  vazioTitulo = "Nada pendente agora",
  vazioTexto = "Sem cobrança atrasada, confirmação ou tarefa vencida.",
  visiveis: quantosInicio = 4,
}: {
  avisos: AvisoDash[];
  titulo?: string;
  vazioTitulo?: string;
  vazioTexto?: string;
  /** Quantos avisos aparecem antes do "Ver mais" (padrão 4). */
  visiveis?: number;
}) {
  const [aberto, setAberto] = useState(false);
  const lista = [...avisos].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
  const urgentes = lista.filter((a) => a.nivel === "urgente").length;
  const mostrados = aberto ? lista : lista.slice(0, quantosInicio);

  if (lista.length === 0) {
    return (
      <div className="cartao flex items-center gap-3 p-4">
        <IconeChip icone={PartyPopper} cor="verde" />
        <div>
          <p className="text-sm font-bold text-neutral-900">{vazioTitulo}</p>
          <p className="text-xs text-neutral-500">{vazioTexto}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="cartao px-3 pb-1 pt-1">
      <div className="flex items-center justify-between px-2 pb-1 pt-3">
        <p className="text-[13px] font-bold uppercase tracking-[0.06em] text-slate-600">
          {titulo} <span className="text-slate-400">· {lista.length}</span>
        </p>
        {urgentes > 0 && (
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600">
            {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {mostrados.map((a) => (
          <li key={a.id}>
            <Link href={a.href} className="flex items-center gap-3 px-2 py-3 active:bg-neutral-50">
              <span className="relative flex-shrink-0">
                <IconeChip icone={(ICONES[a.icone] ?? ICONES.conversa).icone} cor={(ICONES[a.icone] ?? ICONES.conversa).cor} tamanho="lg" />
                <span className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white ${PONTO[a.nivel]}`} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold leading-snug text-slate-900">{a.texto}</span>
                {a.detalhe && <span className="mt-0.5 block truncate text-[12.5px] text-neutral-500">{a.detalhe}</span>}
              </span>
              <ChevronRight size={16} className="flex-shrink-0 text-neutral-300" />
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > quantosInicio && (
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          className="flex w-full items-center justify-center gap-1 rounded-2xl py-2 text-xs font-semibold text-neutral-500"
        >
          {aberto ? "Mostrar menos" : `Ver mais ${lista.length - quantosInicio}`}
          <ChevronDown size={14} className={aberto ? "rotate-180" : ""} />
        </button>
      )}
    </section>
  );
}
