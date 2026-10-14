import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import { hojeLocal, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/period";
import { porCategoria, contaNoResultado, type LinhaFinanceira } from "@/lib/relatorio-financeiro";
import NovoLancamentoPessoalBotao from "@/components/NovoLancamentoPessoalBotao";

function oneOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

const caixa =
  "rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl";

// Início do espaço Pessoal: saldo da conta, o mês, contas fixas, faturas dos
// cartões pessoais e para onde foi o dinheiro.
export default async function PessoalInicioPage() {
  const supabase = createClient();
  const hoje = hojeLocal();
  const ini = primeiroDiaDoMes(hoje);
  const fim = ultimoDiaDoMes(hoje);
  const [settings, { data: todos }, { data: doMesRaw }, { data: faturasRaw }, { data: cartoesRaw }, { data: catsRaw }, { data: clientes }] =
    await Promise.all([
      fetchSettings(supabase),
      supabase.from("transactions").select("type, amount, cartao_mov").eq("scope", "pessoal").eq("is_test", false).limit(20000),
      supabase
        .from("transactions_contabilizaveis")
        .select("id, type, amount, date, description, cartao_mov, categories(name)")
        .eq("scope", "pessoal")
        .gte("date", ini)
        .lte("date", fim)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("faturas_cartao").select("cartao_id, fatura_ref, vencimento, total_compras, total_pago").eq("scope", "pessoal").order("vencimento"),
      supabase.from("cartoes").select("id, nome"),
      supabase.from("categories").select("id, name, type").eq("scope", "harmonize").eq("type", "saida").order("name"),
      supabase.from("clients").select("id, name").order("name"),
    ]);

  // Compra no cartão só sai da conta quando a fatura é paga.
  const saldo = (todos ?? [])
    .filter((t: any) => t.cartao_mov !== "compra")
    .reduce((s, t: any) => s + (t.type === "entrada" ? 1 : -1) * Number(t.amount), 0);
  const linhas: (LinhaFinanceira & { id: string; description: string })[] = ((doMesRaw ?? []) as any[]).map((t) => ({
    id: t.id,
    description: t.description,
    type: t.type,
    amount: Number(t.amount),
    date: t.date,
    cartao_mov: t.cartao_mov,
    categoria: oneOf<{ name: string }>(t.categories)?.name ?? null,
  }));
  const noResultado = linhas.filter(contaNoResultado);
  const entradas = noResultado.filter((l) => l.type === "entrada").reduce((s, l) => s + l.amount, 0);
  const saidas = noResultado.filter((l) => l.type === "saida").reduce((s, l) => s + l.amount, 0);
  const gastos = porCategoria(linhas, "saida").slice(0, 5);
  const fixas = settings.despesasFixas.filter((f) => f.tipo === "pessoal");
  const totalFixas = fixas.reduce((s, f) => s + f.valor, 0);
  const nomeCartao = new Map(((cartoesRaw ?? []) as any[]).map((c) => [c.id, c.nome as string]));
  const faturas = ((faturasRaw ?? []) as any[])
    .map((f) => ({ cartao: nomeCartao.get(f.cartao_id) ?? "Cartão", vencimento: f.vencimento as string, falta: Number(f.total_compras) - Number(f.total_pago) }))
    .filter((f) => f.falta > 0.009)
    .slice(0, 4);
  const rotuloMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-neutral-900">Pessoal</h1>
        <NovoLancamentoPessoalBotao categorias={(catsRaw ?? []) as any} clientes={(clientes ?? []) as any} />
      </div>

      <div className={caixa}>
        <p className="text-[11px] uppercase tracking-wide text-neutral-400">Saldo da conta pessoal</p>
        <p className={`text-2xl font-semibold ${saldo >= 0 ? "text-brand-teal" : "text-brand-pink"}`}>{formatCurrency(saldo)}</p>
        <p className="text-[11px] text-neutral-500">Retiradas da Harmonize entram aqui sozinhas.</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Entrou", entradas, "text-brand-teal"],
          ["Saiu", saidas, "text-brand-pink"],
          ["Sobrou", entradas - saidas, entradas - saidas >= 0 ? "text-brand-teal" : "text-brand-pink"],
        ].map(([rotulo, valor, cor]) => (
          <div key={rotulo as string} className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl">
            <p className="text-[11px] uppercase tracking-wide text-neutral-400">{rotulo as string}</p>
            <p className={`mt-0.5 text-sm font-semibold ${cor}`}>{formatCurrency(valor as number)}</p>
          </div>
        ))}
      </div>
      <p className="-mt-2 text-[11px] text-neutral-500">Em {rotuloMes}. Compra no cartão conta no mês da parcela.</p>

      {fixas.length > 0 && (
        <div className={caixa}>
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold text-neutral-900">Contas fixas do mês</p>
            <p className="text-sm font-semibold text-neutral-700">{formatCurrency(totalFixas)}</p>
          </div>
          <ul className="mt-2 space-y-1">
            {fixas.map((f) => (
              <li key={f.nome} className="flex justify-between text-xs text-neutral-600">
                <span>{f.nome}</span>
                <span>{formatCurrency(f.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {faturas.length > 0 && (
        <Link href="/pessoal/cartoes" className={`block ${caixa}`}>
          <p className="text-sm font-semibold text-neutral-900">Faturas a pagar</p>
          <ul className="mt-2 space-y-1">
            {faturas.map((f) => (
              <li key={f.cartao + f.vencimento} className="flex justify-between text-xs text-neutral-600">
                <span>
                  {f.cartao} · vence {formatDate(f.vencimento)}
                  {f.vencimento < hoje && <span className="ml-1 font-semibold text-red-600">vencida</span>}
                </span>
                <span className="font-medium">{formatCurrency(f.falta)}</span>
              </li>
            ))}
          </ul>
        </Link>
      )}

      <Link href="/pessoal/relatorios" className={`block ${caixa}`}>
        <p className="text-sm font-semibold text-neutral-900">Para onde foi o dinheiro este mês</p>
        {gastos.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400">Nenhum gasto lançado ainda.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {gastos.map((g) => (
              <li key={g.categoria}>
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-700">{g.categoria}</span>
                  <span className="font-medium text-neutral-900">{formatCurrency(g.total)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-brand-pink" style={{ width: `${Math.max(2, Math.round(g.pct * 100))}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-brand-teal">Ver relatórios →</p>
      </Link>

      <Link href="/pessoal/lancamentos" className={`block ${caixa}`}>
        <p className="text-sm font-semibold text-neutral-900">Últimos lançamentos</p>
        {linhas.length === 0 ? (
          <p className="mt-2 text-xs text-neutral-400">
            Nada este mês. Comece com um lançamento de entrada &quot;Saldo inicial&quot; com o valor que você tem hoje.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-neutral-200/70">
            {linhas.slice(0, 6).map((l) => (
              <li key={l.id} className="flex justify-between gap-2 py-1.5 text-xs">
                <span className="min-w-0 truncate text-neutral-700">
                  {formatDate(l.date)} · {l.description}
                </span>
                <span className={`shrink-0 font-medium ${l.type === "entrada" ? "text-brand-teal" : "text-brand-pink"}`}>
                  {l.type === "entrada" ? "+" : "−"}
                  {formatCurrency(l.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-brand-teal">Ver todos →</p>
      </Link>
    </div>
  );
}
