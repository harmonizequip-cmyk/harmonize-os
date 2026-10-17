import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { MetaDoMes } from "@/lib/meta-mes";

/**
 * Destaque do topo do Dashboard: o mês (pedido do dono, 17/10/2026). Juntou
 * "Este mês" e "Meta do mês": quantas locações contra a meta (com as reservas
 * que ainda podem virar locação) e quanto as locações já renderam contra as
 * contas fixas. Leva às locações do mês.
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
    locacoes > metaMax ? "Acima da meta máxima 🚀" : locacoes >= metaMin ? "Dentro da meta ✓" : `Faltam ${metaMin - locacoes} para a meta`;

  return (
    <Link href="/locacoes?period=mes" className="block overflow-hidden rounded-3xl bg-brand-gradient p-4 text-white shadow-glow-teal active:brightness-95">
      <p className="text-[12px] font-medium text-white/85">{saudacao}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-extrabold capitalize leading-tight">{rotuloMes}</h1>
        <p className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold">{statusMeta}</p>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/15 p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-white/80">Locações</p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums leading-none">{locacoes}</p>
          <p className="mt-1 text-[11px] text-white/85">
            meta {metaMin} a {metaMax}
            {preReservas > 0 ? ` · +${preReservas} reservadas` : ""}
          </p>
        </div>
        <div className="rounded-2xl bg-white/15 p-3">
          <p className="text-[10.5px] font-bold uppercase tracking-wider text-white/80">Faturado</p>
          <p className="mt-1 truncate text-lg font-extrabold tabular-nums leading-tight">{formatCurrency(faturamento)}</p>
          <p className="mt-1 text-[11px] text-white/85">nas locações do mês</p>
        </div>
      </div>

      <div className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-white/25">
        <div className="absolute inset-y-0 left-0 rounded-full bg-white" style={{ width: `${pct(locacoes)}%` }} />
        <div className="absolute inset-y-0 bg-white/45" style={{ left: `${pct(locacoes)}%`, width: `${Math.max(0, pct(locacoes + preReservas) - pct(locacoes))}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-900/30" style={{ left: `${pct(metaMin)}%` }} />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-900/30" style={{ left: `${pct(metaMax)}%` }} />
      </div>

      <div className="mt-3 rounded-2xl bg-white px-3 py-2.5 text-neutral-800">
        {meta ? (
          <>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs text-neutral-500">Contas fixas {formatCurrency(meta.totalFixas)}</p>
              <p className="text-sm font-bold tabular-nums">
                {meta.falta === 0 ? (
                  <span className="text-brand-teal-dark">Cobertas ✓{meta.excedente > 0 ? ` +${formatCurrency(meta.excedente)}` : ""}</span>
                ) : (
                  <span className="text-amber-600">Faltam {formatCurrency(meta.falta)}</span>
                )}
              </p>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.round(meta.progresso * 100)}%` }} />
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
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
