import Link from "next/link";
import { BarChart3, CalendarDays, Check, FileText, Target } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { MetaDoMes } from "@/lib/meta-mes";
import { IconeChip, OndaMarca, Pilula } from "@/components/ui/Visual";

/**
 * Destaque do topo do Dashboard: o mês (pedido do dono, 17/10/2026), no
 * padrão visual aprovado (cartão branco, onda da marca no canto, ícones em
 * quadradinhos). Locações contra a meta (com as reservas que ainda podem virar
 * locação), faturado e contas fixas. Leva às locações do mês.
 */
export default function MesCard({
  saudacao,
  rotuloMes,
  locacoes,
  preReservas,
  metaMin,
  metaMax,
  meta,
  faturamento,
}: {
  saudacao: string;
  rotuloMes: string;
  locacoes: number;
  preReservas: number;
  metaMin: number;
  metaMax: number;
  meta: MetaDoMes | null;
  faturamento: number;
}) {
  const escala = Math.max(metaMax + 5, locacoes + preReservas);
  const pct = (n: number) => Math.min(100, (n / escala) * 100);
  const statusMeta =
    locacoes > metaMax ? "Acima da meta máxima" : locacoes >= metaMin ? "Dentro da meta" : `Faltam ${metaMin - locacoes} para a meta`;

  return (
    <Link href="/locacoes?period=mes" className="cartao block p-4 active:bg-neutral-50">
      <OndaMarca />
      <p className="relative text-[13px] leading-snug text-neutral-600">{saudacao}</p>
      <div className="relative mt-2 flex items-center justify-between gap-2">
        <h1 className="text-3xl font-extrabold capitalize leading-none text-slate-900">{rotuloMes}</h1>
        <span className="whitespace-nowrap">
          <Pilula icone={Target} cor={locacoes >= metaMin ? "verde" : "teal"}>
            {statusMeta}
          </Pilula>
        </span>
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-2.5">
        <div className="flex gap-2 rounded-3xl bg-slate-50/80 p-2.5">
          <IconeChip icone={CalendarDays} cor="teal" tamanho="sm" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500">Locações</p>
            <p className="text-3xl font-extrabold tabular-nums leading-tight text-slate-900">{locacoes}</p>
            <p className="text-[11.5px] leading-snug text-neutral-500">
              meta {metaMin} a {metaMax}
              {preReservas > 0 ? ` · +${preReservas} reservadas` : ""}
            </p>
          </div>
        </div>
        <div className="flex gap-2 rounded-3xl bg-slate-50/80 p-2.5">
          <IconeChip icone={BarChart3} cor="roxo" tamanho="sm" />
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-neutral-500">Faturado</p>
            <p className="whitespace-nowrap pt-1 text-[15px] font-extrabold tabular-nums leading-tight tracking-tight text-slate-900">{formatCurrency(faturamento)}</p>
            <p className="text-[11.5px] leading-snug text-neutral-500">nas locações do mês</p>
          </div>
        </div>
      </div>

      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-teal-500 to-teal-400" style={{ width: `${pct(locacoes)}%` }} />
        <div className="absolute inset-y-0 bg-teal-200/70" style={{ left: `${pct(locacoes)}%`, width: `${Math.max(0, pct(locacoes + preReservas) - pct(locacoes))}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-slate-400/70" style={{ left: `${pct(metaMin)}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-slate-400/70" style={{ left: `${pct(metaMax)}%` }} />
      </div>

      <div className="relative mt-4 rounded-3xl bg-slate-50/80 p-3">
        {meta ? (
          <>
            <div className="flex items-center gap-2.5">
              <IconeChip icone={FileText} cor="teal" tamanho="sm" />
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-xs text-neutral-500">Contas fixas</p>
                <p className="whitespace-nowrap text-sm font-bold tabular-nums text-slate-900">{formatCurrency(meta.totalFixas)}</p>
              </div>
              <span className="h-9 w-px flex-shrink-0 bg-slate-200" />
              {meta.falta === 0 ? (
                <div className="flex min-w-0 items-center gap-2">
                  
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-emerald-600">Cobertas ✓</p>
                    <p className="truncate text-sm font-extrabold tabular-nums text-emerald-600">
                      {meta.excedente > 0 ? `+${formatCurrency(meta.excedente)}` : "no zero"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="min-w-0 text-right">
                  <p className="text-xs font-bold text-amber-600">Faltam</p>
                  <p className="truncate text-sm font-extrabold tabular-nums text-amber-600">{formatCurrency(meta.falta)}</p>
                </div>
              )}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/70">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(meta.progresso * 100)}%` }} />
            </div>
            <p className="mt-2 text-[12px] leading-snug text-neutral-500">
              Já sobraram {formatCurrency(meta.sobraDoMes)} das locações
              {meta.falta > 0 && meta.locacoesQueFaltam != null
                ? ` · faltam cerca de ${meta.locacoesQueFaltam} ${meta.locacoesQueFaltam === 1 ? "locação" : "locações"}`
                : ""}
              {meta.falta > 0 && meta.faltaDepoisDasReservas === 0 ? " · as reservas marcadas fecham a conta" : ""}
            </p>
          </>
        ) : (
          <p className="text-xs text-neutral-500">Cadastre as contas fixas em Configurações para ver quanto falta faturar.</p>
        )}
      </div>
    </Link>
  );
}
