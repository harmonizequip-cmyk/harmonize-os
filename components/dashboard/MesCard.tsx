import Link from "next/link";
import { CalendarClock, CheckCircle2, FileText, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import type { MetaDoMes } from "@/lib/meta-mes";

/**
 * Destaque do topo do Dashboard: o mês, no mesmo estilo do "Meu dinheiro" do
 * Pessoal (cartão escuro com rosca), mas no verde-turquesa da borboleta da
 * marca (pedido do dono, 19/10/2026). Locações contra a meta (com as reservas
 * que ainda podem virar locação), faturado e contas fixas. Leva às locações do mês.
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
  const statusMeta =
    locacoes > metaMax ? "Acima da meta máxima" : locacoes >= metaMin ? "Dentro da meta" : `Faltam ${metaMin - locacoes} para a meta`;
  const pct = metaMin > 0 ? locacoes / metaMin : null;
  const pctComReservas = metaMin > 0 ? (locacoes + preReservas) / metaMin : null;
  const r = 38;
  const c = 2 * Math.PI * r;
  const preenchido = Math.min(1, pct ?? 0);
  const preenchidoReservas = Math.min(1, pctComReservas ?? 0);
  const bateu = locacoes >= metaMin;

  return (
    <Link
      href="/locacoes?period=mes"
      className="relative block overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#05302d] via-[#0b6b63] to-[#1fae9f] p-5 text-white shadow-[0_24px_50px_-24px_rgb(13_110_100/0.9)] active:opacity-95"
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-emerald-300/25 blur-2xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-16 -left-10 h-44 w-44 rounded-full bg-sky-300/20 blur-2xl" />

      <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-teal-100">Seu mês · {rotuloMes}</p>
      <p className="relative mt-1 text-[13px] leading-snug text-teal-50/90">{saudacao}</p>

      <div className="relative mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-teal-100">Locações</p>
          <p className="whitespace-nowrap text-[2rem] font-black leading-tight tabular-nums">
            {locacoes}
            <span className="ml-1.5 text-base font-bold text-teal-100">
              de {metaMin} a {metaMax}
            </span>
          </p>
          <p className="mt-1 text-[12.5px] text-teal-100">Faturado {formatCurrency(faturamento)}</p>
        </div>
        <div className="relative h-24 w-24 flex-shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="11" />
            {preReservas > 0 && (
              <circle
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke="rgba(204,251,241,0.35)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - preenchidoReservas)}
              />
            )}
            <circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={bateu ? "#6ee7b7" : "#5eead4"}
              strokeWidth="11"
              strokeLinecap="round"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - preenchido)}
              style={{ transition: "stroke-dashoffset 0.9s cubic-bezier(0.22,1,0.36,1)" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-black tabular-nums">{pct === null ? "-" : `${Math.round(pct * 100)}%`}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-teal-100">da meta</span>
          </div>
        </div>
      </div>

      <div className="relative mt-4 flex flex-wrap gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            bateu ? "bg-emerald-300/20 text-emerald-100" : "bg-white/15 backdrop-blur"
          }`}
        >
          <CheckCircle2 size={14} className={bateu ? "" : "text-teal-200"} /> {statusMeta}
        </span>
        {preReservas > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur">
            <CalendarClock size={14} className="text-teal-200" /> +{preReservas} {preReservas === 1 ? "reservada" : "reservadas"}
          </span>
        )}
      </div>

      <div className="relative mt-4 rounded-3xl bg-white/10 p-3 backdrop-blur">
        {meta ? (
          <>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-white/15">
                <FileText size={17} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-nowrap text-xs text-teal-100">Contas fixas</p>
                <p className="whitespace-nowrap text-sm font-bold tabular-nums">{formatCurrency(meta.totalFixas)}</p>
              </div>
              <span className="h-9 w-px flex-shrink-0 bg-white/20" />
              {meta.falta === 0 ? (
                <div className="min-w-0 text-right">
                  <p className="text-xs font-bold text-emerald-200">Cobertas</p>
                  <p className="truncate text-sm font-extrabold tabular-nums text-emerald-200">
                    {meta.excedente > 0 ? `+${formatCurrency(meta.excedente)}` : "no zero"}
                  </p>
                </div>
              ) : (
                <div className="min-w-0 text-right">
                  <p className="text-xs font-bold text-amber-200">Faltam</p>
                  <p className="truncate text-sm font-extrabold tabular-nums text-amber-200">{formatCurrency(meta.falta)}</p>
                </div>
              )}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-emerald-300" style={{ width: `${Math.round(meta.progresso * 100)}%` }} />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-snug text-teal-50/90">
              <Wallet size={13} className="mt-0.5 flex-shrink-0 text-teal-200" />
              <span>
                Já sobraram {formatCurrency(meta.sobraDoMes)} das locações
                {meta.falta > 0 && meta.locacoesQueFaltam != null
                  ? ` · faltam cerca de ${meta.locacoesQueFaltam} ${meta.locacoesQueFaltam === 1 ? "locação" : "locações"}`
                  : ""}
                {meta.falta > 0 && meta.faltaDepoisDasReservas === 0 ? " · as reservas marcadas fecham a conta" : ""}
              </span>
            </p>
          </>
        ) : (
          <p className="text-xs text-teal-50/90">Cadastre as contas fixas em Configurações para ver quanto falta faturar.</p>
        )}
      </div>
    </Link>
  );
}
