import Link from "next/link";
import { formatCurrency } from "@/lib/format";
import type { MetaDoMes } from "@/lib/meta-mes";

/**
 * Quadro "Este mês": quanto as locações do mês já sobraram (valor menos as
 * despesas lançadas nelas) contra as contas fixas, quanto falta e quantas
 * locações isso representa. Leva à lista de locações do mês.
 */
export default function EsteMesCard({ meta, rotuloMes }: { meta: MetaDoMes | null; rotuloMes: string }) {
  if (!meta) {
    return (
      <Link
        href="/configuracoes"
        className="block rounded-2xl border border-dashed border-neutral-300 bg-white/60 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900/40 dark:text-neutral-300"
      >
        💰 Cadastre as contas fixas do mês em Configurações para ver quanto falta faturar →
      </Link>
    );
  }
  const coberto = meta.falta === 0;
  return (
    <Link
      href="/locacoes?period=mes"
      className="block rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Este mês · {rotuloMes}
        </p>
        <p className="text-xs text-neutral-400">contas {formatCurrency(meta.totalFixas)}</p>
      </div>

      {coberto ? (
        <p className="mt-1 text-lg font-semibold text-brand-teal">
          Contas do mês cobertas ✓
          {meta.excedente > 0 && (
            <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">
              {" "}
              · sobra de {formatCurrency(meta.excedente)}
            </span>
          )}
        </p>
      ) : (
        <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Faltam <span className="text-amber-600 dark:text-amber-400">{formatCurrency(meta.falta)}</span>
          {meta.locacoesQueFaltam != null && (
            <span className="text-sm font-normal text-neutral-500 dark:text-neutral-400">
              {" "}
              · cerca de {meta.locacoesQueFaltam} {meta.locacoesQueFaltam === 1 ? "locação" : "locações"}
            </span>
          )}
        </p>
      )}

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="h-full rounded-full bg-brand-teal" style={{ width: `${Math.round(meta.progresso * 100)}%` }} />
      </div>

      <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
        Locações do mês já renderam {formatCurrency(meta.sobraDoMes)} (valor menos as despesas delas).
        {meta.totalPessoal > 0 &&
          ` Contas: ${formatCurrency(meta.totalNegocio)} do negócio + ${formatCurrency(meta.totalPessoal)} pessoais.`}
      </p>
      {!coberto && meta.previsaoDasReservas != null && meta.previsaoDasReservas > 0 && (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          As reservas já marcadas para o resto do mês devem render cerca de {formatCurrency(meta.previsaoDasReservas)}
          {meta.faltaDepoisDasReservas === 0
            ? ": se todas acontecerem, as contas fecham."
            : `: ainda faltariam ${formatCurrency(meta.faltaDepoisDasReservas ?? 0)}.`}
        </p>
      )}
      {meta.locacoesQueFaltam == null && !coberto && (
        <p className="mt-1 text-xs text-neutral-400">Sem locações recentes para estimar quantas faltam.</p>
      )}
    </Link>
  );
}
