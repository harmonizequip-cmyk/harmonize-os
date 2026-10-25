// Peças visuais comuns das telas de Campanhas.

import {
  AlertTriangle,
  CalendarCheck,
  CircleCheck,
  CircleSlash,
  Flame,
  MessageCircleReply,
  Moon,
  Send,
  SkipForward,
  Snowflake,
  Sprout,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { CORES, type CorVisual } from "@/components/ui/Visual";
import { ROTULO_CLASSE, type Classe } from "@/lib/relacionamento";
import { ROTULO_STATUS, type StatusEnvio } from "@/lib/campanhas";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";

export const VISUAL_CLASSE: Record<Classe, { icone: LucideIcon; cor: CorVisual }> = {
  agendada: { icone: CalendarCheck, cor: "rosa" },
  nova: { icone: Sprout, cor: "verde" },
  ativa: { icone: CircleCheck, cor: "teal" },
  em_risco: { icone: AlertTriangle, cor: "ambar" },
  sumida: { icone: Moon, cor: "cinza" },
  quente: { icone: Flame, cor: "vermelho" },
  morna: { icone: Sun, cor: "ambar" },
  fria: { icone: Snowflake, cor: "azul" },
};

export const VISUAL_STATUS: Record<StatusEnvio, { icone: LucideIcon; cor: CorVisual }> = {
  enviado: { icone: Send, cor: "teal" },
  respondeu: { icone: MessageCircleReply, cor: "azul" },
  agendou: { icone: CalendarCheck, cor: "verde" },
  nao_quer: { icone: CircleSlash, cor: "vermelho" },
  pulado: { icone: SkipForward, cor: "cinza" },
};

export function SeloClasse({ classe }: { classe: Classe }) {
  const v = VISUAL_CLASSE[classe];
  const I = v.icone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${CORES[v.cor].pilula}`}>
      <I size={12} strokeWidth={2.4} />
      {ROTULO_CLASSE[classe].rotulo}
    </span>
  );
}

export function SeloStatus({ status }: { status: StatusEnvio }) {
  const v = VISUAL_STATUS[status];
  const I = v.icone;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${CORES[v.cor].pilula}`}>
      <I size={12} strokeWidth={2.4} />
      {ROTULO_STATUS[status]}
    </span>
  );
}

export function FaltaSql() {
  return (
    <section className="cartao p-5">
      <p className="text-base font-bold text-neutral-900">Falta rodar o SQL das campanhas</p>
      <p className="mt-1 text-sm text-neutral-600">
        As tabelas das campanhas ainda não existem no banco. Assim que o SQL for rodado no Supabase, esta tela passa a funcionar.
      </p>
    </section>
  );
}

export function nomeDaPessoa(p: { nome: string; treatment: string | null; displayName: string | null }): string {
  return p.displayName ? [p.treatment, p.displayName].filter(Boolean).join(" ") : p.nome;
}

/** Dia (dd/mm/aaaa, Brasília) de um carimbo de data e hora. */
export function diaDe(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatDate(hojeLocal(new Date(iso)));
}

/** "hoje 14:05" ou "12/10/2026". */
export function quandoFoi(iso: string | null | undefined, hoje: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const dia = hojeLocal(d);
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
  if (dia === hoje) return `hoje ${hora}`;
  return formatDate(dia);
}
