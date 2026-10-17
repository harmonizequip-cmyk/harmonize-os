import Link from "next/link";
import { BarChart3, CreditCard, ListOrdered, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { foraDoSaldo } from "@/lib/cartao";
import { fetchSettings } from "@/lib/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { contaNoResultado, type LinhaFinanceira } from "@/lib/relatorio-financeiro";
import { avisosPessoais, comparacaoPorCategoria, mesComDesvio, resumoDoMes, type FaturaPessoal } from "@/lib/pessoal-controle";
import { visualDaCategoria } from "@/lib/pessoal-icones";
import NovoLancamentoPessoalBotao from "@/components/NovoLancamentoPessoalBotao";
import PrecisaDeVoce from "@/components/dashboard/PrecisaDeVoce";
import HeroPessoal from "@/components/pessoal/HeroPessoal";
import RosquinhaGastos from "@/components/pessoal/RosquinhaGastos";
import FaturasCartoes from "@/components/pessoal/FaturasCartoes";

function oneOf<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Início do espaço Pessoal (17/10/2026): controle geral do dinheiro do dono,
// com identidade própria (violeta e coral) para não confundir com a Harmonize.
// Destaque escuro com a rosca do que já saiu, avisos do que precisa de atenção,
// faturas como cartões, para onde foi o dinheiro (com a média dos 3 meses
// anteriores), contas fixas e a linha do tempo dos últimos lançamentos.
export default async function PessoalInicioPage() {
  const supabase = createClient();
  const hoje = hojeLocal();
  const desde = `${mesComDesvio(hoje, -3)}-01`;
  const [settings, { data: todos }, { data: histRaw }, { data: faturasRaw }, { data: cartoesRaw }, { data: catsRaw }, { data: clientes }] =
    await Promise.all([
      fetchSettings(supabase),
      supabase.from("transactions").select("type, amount, cartao_mov, payment_method").eq("scope", "pessoal").eq("is_test", false).limit(20000),
      supabase
        .from("transactions_contabilizaveis")
        .select("id, type, amount, date, description, cartao_mov, created_at, categories(name)")
        .eq("scope", "pessoal")
        .gte("date", desde)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(6000),
      supabase.from("faturas_cartao").select("cartao_id, fatura_ref, vencimento, total_compras, total_pago").eq("scope", "pessoal").order("vencimento"),
      supabase.from("cartoes").select("id, nome"),
      supabase.from("categories").select("id, name, type").eq("scope", "harmonize").eq("type", "saida").order("name"),
      supabase.from("clients").select("id, name").order("name"),
    ]);

  // Compra no cartão só sai da conta quando a fatura é paga.
  const saldo = (todos ?? [])
    .filter((t: any) => !foraDoSaldo(t))
    .reduce((s, t: any) => s + (t.type === "entrada" ? 1 : -1) * Number(t.amount), 0);

  const historico = ((histRaw ?? []) as any[]).map((t) => ({
    id: t.id as string,
    description: t.description as string,
    created_at: t.created_at as string,
    type: t.type as "entrada" | "saida",
    amount: Number(t.amount),
    date: t.date as string,
    cartao_mov: t.cartao_mov,
    categoria: oneOf<{ name: string }>(t.categories)?.name ?? null,
  }));
  const linhas: LinhaFinanceira[] = historico;
  const resumo = resumoDoMes(linhas, hoje);
  const categorias = comparacaoPorCategoria(linhas, hoje);

  const fixas = settings.despesasFixas.filter((f) => f.tipo === "pessoal");
  const totalFixas = fixas.reduce((s, f) => s + f.valor, 0);
  const nomeCartao = new Map(((cartoesRaw ?? []) as any[]).map((c) => [c.id, c.nome as string]));
  const faturas: FaturaPessoal[] = ((faturasRaw ?? []) as any[])
    .map((f) => ({ cartao: nomeCartao.get(f.cartao_id) ?? "Cartão", vencimento: f.vencimento as string, falta: Number(f.total_compras) - Number(f.total_pago) }))
    .filter((f) => f.falta > 0.009);
  const faturasAbertas = faturas.reduce((s, f) => s + f.falta, 0);

  const ultimoLancamento = historico.length
    ? historico.reduce((m, l) => (l.created_at > m ? l.created_at : m), historico[0].created_at).slice(0, 10)
    : null;
  const avisos = avisosPessoais({ linhas, hoje, saldo, faturas, totalFixas, ultimoLancamento }).map((a) => ({
    id: a.id,
    icone: a.icone,
    texto: a.texto,
    detalhe: a.detalhe,
    href: a.href,
    nivel: a.nivel,
  }));

  const rotuloMes = new Date(`${hoje}T12:00:00Z`).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });
  const doMes = historico.filter((l) => l.date.slice(0, 7) === hoje.slice(0, 7));
  const gastoDoMes = categorias.reduce((s, c) => s + c.atual, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-black tracking-tight text-violet-950">Meu dinheiro</h1>
        <NovoLancamentoPessoalBotao categorias={(catsRaw ?? []) as any} clientes={(clientes ?? []) as any} />
      </div>

      <HeroPessoal rotuloMes={rotuloMes} resumo={resumo} />

      {/* Três números que mandam no mês */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/pessoal/lancamentos" className="cartao p-3 active:bg-violet-50">
          <Wallet size={18} className="text-violet-600" />
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Na conta</p>
          <p className={`text-[15px] font-black tabular-nums ${saldo < 0 ? "text-rose-600" : "text-slate-900"}`}>{formatCurrency(saldo)}</p>
        </Link>
        <Link href="/pessoal/cartoes" className="cartao p-3 active:bg-violet-50">
          <CreditCard size={18} className="text-fuchsia-600" />
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Faturas</p>
          <p className="text-[15px] font-black tabular-nums text-slate-900">{formatCurrency(faturasAbertas)}</p>
        </Link>
        <div className="cartao p-3">
          <ListOrdered size={18} className="text-sky-600" />
          <p className="mt-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">Contas fixas</p>
          <p className="text-[15px] font-black tabular-nums text-slate-900">{formatCurrency(totalFixas)}</p>
        </div>
      </div>

      <PrecisaDeVoce
        avisos={avisos}
        titulo="Atenção"
        vazioTitulo="Tudo sob controle"
        vazioTexto="Sem fatura vencendo, gasto fora do normal ou saldo no vermelho."
      />

      <FaturasCartoes faturas={faturas.slice(0, 6)} hoje={hoje} />

      <section className="cartao p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-violet-900/70">Para onde foi o dinheiro</p>
          <Link href="/pessoal/relatorios" className="flex items-center gap-1 text-xs font-bold text-violet-700">
            <BarChart3 size={14} /> Relatórios
          </Link>
        </div>
        {categorias.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nenhum gasto lançado neste mês.</p>
        ) : (
          <RosquinhaGastos itens={categorias} total={gastoDoMes} />
        )}
      </section>

      {fixas.length > 0 && (
        <section className="cartao p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-violet-900/70">Contas fixas do mês</p>
            <p className="text-sm font-black tabular-nums text-slate-900">{formatCurrency(totalFixas)}</p>
          </div>
          {resumo.entradas > 0 && (
            <p className="mt-0.5 text-[12px] text-slate-500">{Math.round((totalFixas / resumo.entradas) * 100)}% do que entrou neste mês</p>
          )}
          <ul className="mt-3 divide-y divide-violet-100">
            {fixas.map((f) => {
              const v = visualDaCategoria(f.nome);
              const Icone = v.icone;
              return (
                <li key={f.nome} className="flex items-center gap-3 py-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl" style={{ backgroundColor: `${v.cor}1f`, color: v.cor }}>
                    <Icone size={16} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{f.nome}</span>
                  <span className="text-sm font-bold tabular-nums text-slate-900">{formatCurrency(f.valor)}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section className="cartao p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[12px] font-extrabold uppercase tracking-[0.1em] text-violet-900/70">Linha do tempo</p>
          <Link href="/pessoal/lancamentos" className="text-xs font-bold text-violet-700">
            Ver todos
          </Link>
        </div>
        {doMes.length === 0 ? (
          <p className="py-3 text-sm text-slate-400">
            Nada neste mês. Comece com um lançamento de entrada &quot;Saldo inicial&quot; com o valor que você tem hoje.
          </p>
        ) : (
          <ul className="relative space-y-3 pl-1">
            {doMes.slice(0, 7).map((l) => {
              const v = visualDaCategoria(l.categoria);
              const Icone = v.icone;
              return (
                <li key={l.id} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${v.cor}1f`, color: v.cor }}>
                    <Icone size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{l.description}</span>
                    <span className="block text-[11.5px] text-slate-500">
                      {formatDate(l.date)}
                      {l.categoria ? ` · ${l.categoria}` : ""}
                    </span>
                  </span>
                  <span className={`text-sm font-extrabold tabular-nums ${l.type === "entrada" ? "text-emerald-600" : "text-slate-900"}`}>
                    {l.type === "entrada" ? "+" : "-"}
                    {formatCurrency(l.amount)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
