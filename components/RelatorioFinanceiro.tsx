"use client";

// Relatório financeiro de um lado (Harmonize ou Pessoal): gastos e entradas
// por categoria no período, evolução dos últimos 12 meses, faturas de cartão
// e, na Harmonize, empréstimos. Contas em lib/relatorio-financeiro.ts.

import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/format";
import { rotuloFatura } from "@/lib/cartao";
import type { CategoriaSoma, MesResumo } from "@/lib/relatorio-financeiro";

export interface FaturaRelatorio {
  cartao: string;
  fatura_ref: string;
  vencimento: string;
  total_compras: number;
  total_pago: number;
}

export interface EmprestimoRelatorio {
  devedor: string;
  concedido: number;
  devolvido: number;
  saldo: number;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (ref: string) => {
  const [a, m] = ref.split("-").map(Number);
  return `${MESES[m - 1]}/${String(a).slice(2)}`;
};

function Cartao({ titulo, children, dica }: { titulo: string; children: React.ReactNode; dica?: string }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
      <p className="text-sm font-semibold text-neutral-900">{titulo}</p>
      {dica && <p className="mt-0.5 text-[11px] text-neutral-500">{dica}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function Barras({ itens, cor }: { itens: CategoriaSoma[]; cor: string }) {
  if (itens.length === 0) return <p className="text-xs text-neutral-400">Nada no período.</p>;
  const total = itens.reduce((s, i) => s + i.total, 0);
  return (
    <>
      <ul className="space-y-2">
        {itens.slice(0, 10).map((i) => (
          <li key={i.categoria}>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-neutral-700">{i.categoria}</span>
              <span className="shrink-0 font-medium text-neutral-900">
                {formatCurrency(i.total)} <span className="font-normal text-neutral-400">· {Math.round(i.pct * 100)}%</span>
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200">
              <div className={`h-full rounded-full ${cor}`} style={{ width: `${Math.max(2, Math.round(i.pct * 100))}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {itens.length > 10 && <p className="mt-2 text-[11px] text-neutral-400">+ {itens.length - 10} categorias menores</p>}
      <p className="mt-2 border-t border-neutral-200/70 pt-2 text-xs font-medium text-neutral-700">
        Total: {formatCurrency(total)}
      </p>
    </>
  );
}

export default function RelatorioFinanceiro({
  escopo,
  rotuloPeriodo,
  gastos,
  entradas,
  evolucao,
  faturas,
  hoje,
  emprestimos,
}: {
  escopo: "harmonize" | "pessoal";
  rotuloPeriodo: string;
  gastos: CategoriaSoma[];
  entradas: CategoriaSoma[];
  evolucao: MesResumo[];
  faturas: FaturaRelatorio[];
  hoje: string;
  emprestimos?: EmprestimoRelatorio[];
}) {
  // Meses do começo sem movimento nenhum (antes de usar o app) ficam de fora.
  const primeiro = evolucao.findIndex((m) => m.entradas > 0 || m.saidas > 0);
  const meses = primeiro === -1 ? evolucao.slice(-1) : evolucao.slice(primeiro);
  const maior = Math.max(1, ...meses.map((m) => Math.max(m.entradas, m.saidas)));
  const totalAno = evolucao.reduce((s, m) => ({ e: s.e + m.entradas, s: s.s + m.saidas }), { e: 0, s: 0 });
  const mesAtual = hoje.slice(0, 7);
  const faturasFuturas = faturas.filter((f) => f.fatura_ref > mesAtual && f.total_compras - f.total_pago > 0.009);
  const comprometido = faturasFuturas.reduce((s, f) => s + (f.total_compras - f.total_pago), 0);
  const faturasRecentes = faturas.filter((f) => f.fatura_ref <= mesAtual).slice(-6);
  const totalEmprestado = (emprestimos ?? []).reduce((s, e) => s + Math.max(0, e.saldo), 0);

  return (
    <div className="space-y-4">
      <Cartao titulo={`Para onde foi o dinheiro (${rotuloPeriodo})`} dica="Gastos por categoria. Empréstimo e pagamento de fatura ficam fora (a compra no cartão já conta).">
        <Barras itens={gastos} cor="bg-brand-pink" />
      </Cartao>

      <Cartao titulo={`De onde entrou (${rotuloPeriodo})`}>
        <Barras itens={entradas} cor="bg-brand-teal" />
      </Cartao>

      <Cartao
        titulo="Mês a mês (últimos 12 meses)"
        dica={`No total: entrou ${formatCurrency(totalAno.e)}, saiu ${formatCurrency(totalAno.s)}, resultado ${formatCurrency(totalAno.e - totalAno.s)}.`}
      >
        <ul className="space-y-2">
          {meses
            .slice()
            .reverse()
            .map((m) => (
              <li key={m.mes} className="text-xs">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="w-12 shrink-0 text-neutral-500">{rotuloMes(m.mes)}</span>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="h-1.5 rounded-full bg-brand-teal" style={{ width: `${(m.entradas / maior) * 100}%` }} />
                    <div className="h-1.5 rounded-full bg-brand-pink" style={{ width: `${(m.saidas / maior) * 100}%` }} />
                  </div>
                  <span className={`w-24 shrink-0 text-right font-medium ${m.resultado >= 0 ? "text-brand-teal" : "text-brand-pink"}`}>
                    {formatCurrency(m.resultado)}
                  </span>
                </div>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-[11px] text-neutral-400">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-teal" />
          entradas
          <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-full bg-brand-pink" />
          saídas · à direita, o resultado do mês
        </p>
      </Cartao>

      <Cartao
        titulo="Cartões de crédito"
        dica={comprometido > 0 ? `Já comprometido nas próximas faturas: ${formatCurrency(comprometido)} (parcelas que ainda vão cair).` : undefined}
      >
        {faturas.length === 0 ? (
          <p className="text-xs text-neutral-400">
            Nenhuma compra no cartão ainda. <Link href="/financeiro/cartoes" className="text-brand-teal underline">Ver cartões</Link>
          </p>
        ) : (
          <>
            {faturasRecentes.length > 0 && (
              <>
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Faturas recentes</p>
                <ul className="divide-y divide-neutral-200/70">
                  {faturasRecentes
                    .slice()
                    .reverse()
                    .map((f) => {
                      const falta = f.total_compras - f.total_pago;
                      return (
                        <li key={f.cartao + f.fatura_ref} className="flex justify-between gap-2 py-1.5 text-xs">
                          <span className="text-neutral-700">
                            {f.cartao} · {rotuloFatura(f.fatura_ref)}
                          </span>
                          <span className="shrink-0">
                            <span className="font-medium text-neutral-900">{formatCurrency(f.total_compras)}</span>
                            <span className={`ml-1 ${falta > 0.009 ? "text-amber-600" : "text-brand-teal"}`}>
                              {falta > 0.009 ? `falta ${formatCurrency(falta)}` : "paga"}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                </ul>
              </>
            )}
            {faturasFuturas.length > 0 && (
              <>
                <p className="mb-1 mt-3 text-[11px] font-medium uppercase tracking-wide text-neutral-400">Próximas faturas</p>
                <ul className="divide-y divide-neutral-200/70">
                  {faturasFuturas.map((f) => (
                    <li key={f.cartao + f.fatura_ref} className="flex justify-between gap-2 py-1.5 text-xs">
                      <span className="text-neutral-700">
                        {f.cartao} · vence {formatDate(f.vencimento)}
                      </span>
                      <span className="shrink-0 font-medium text-neutral-900">
                        {formatCurrency(f.total_compras - f.total_pago)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </Cartao>

      {escopo === "harmonize" && emprestimos && (
        <Cartao titulo="Empréstimos" dica={`A receber de volta: ${formatCurrency(totalEmprestado)}. Fica fora do resultado.`}>
          {emprestimos.length === 0 ? (
            <p className="text-xs text-neutral-400">Nenhum empréstimo lançado.</p>
          ) : (
            <ul className="divide-y divide-neutral-200/70">
              {emprestimos.map((e) => (
                <li key={e.devedor} className="py-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-neutral-800">{e.devedor}</span>
                    <span className={`shrink-0 whitespace-nowrap ${e.saldo > 0 ? "font-semibold text-amber-600" : "text-brand-teal"}`}>
                      {e.saldo > 0 ? `deve ${formatCurrency(e.saldo)}` : "quitado"}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Emprestado {formatCurrency(e.concedido)} · devolvido {formatCurrency(e.devolvido)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link href="/financeiro/emprestimos" className="mt-2 block text-[11px] text-brand-teal underline">
            Abrir Empréstimos
          </Link>
        </Cartao>
      )}
    </div>
  );
}
