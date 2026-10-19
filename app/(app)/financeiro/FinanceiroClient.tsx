"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import HeroTela from "@/components/ui/HeroTela";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { ehCategoriaDeEmprestimo } from "@/lib/emprestimos";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Periodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import { exportarTabela } from "@/lib/exportar-planilha";
import { graficosFinanceiro } from "@/lib/graficos-exportacao";
import NovoLancamentoModal from "./NovoLancamentoModal";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { foraDoResultadoPorCartao, rotuloFatura } from "@/lib/cartao";
import EditarLancamentoModal from "./EditarLancamentoModal";
import { LinkCliente } from "@/components/Atalhos";
import { linkEvento, linkLocacao } from "@/lib/atalhos";
import { agruparPorFatura, linkFatura } from "@/lib/lancamentos-fatura";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  permuta: "Permuta",
  outros: "Outros",
};

interface TransactionRow {
  id: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  payment_method: string;
  date: string;
  category_id: string | null;
  client_id: string | null;
  // Locação a que o lançamento pertence (despesa da locação, pagamento).
  rental_id?: string | null;
  rental_date?: string | null;
  // Reserva ainda sem disparos a que a despesa pertence.
  calendar_event_id?: string | null;
  reserva_date?: string | null;
  categories?: { name: string } | null;
  clients?: { name: string } | null;
  // Lançamento criado com o modo teste ligado. Continua aparecendo aqui
  // de propósito (é onde se confere o que foi lançado), mas fica
  // marcado, porque um número que não bate com o relatório sem
  // explicação visível é pior do que o número estar errado.
  is_test?: boolean;
  // Compra no cartão: date é o vencimento da fatura (quando conta) e data_compra o dia da compra.
  cartao_mov?: "compra" | "pagamento" | null;
  cartao_id?: string | null;
  fatura_ref?: string | null;
  data_compra?: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

interface ClientOption {
  id: string;
  name: string;
}

// Marca o vínculo com a locação. Despesa de cliente sem locação fica em
// âmbar, porque é ela que não entra no lucro de locação nenhuma. A marca
// leva à locação (ficha da cliente) ou à reserva (Agenda) sem abrir a linha.
function vinculoLocacao(t: TransactionRow) {
  const link = "underline decoration-dotted underline-offset-2 hover:text-brand-teal-dark";
  if (t.rental_date) {
    return (
      <span className="ml-1 text-xs font-normal text-neutral-400">
        ·{" "}
        {t.client_id && t.rental_id ? (
          <Link href={linkLocacao(t.client_id, t.rental_id)} onClick={(e) => e.stopPropagation()} className={link}>
            locação {formatDate(t.rental_date)}
          </Link>
        ) : (
          `locação ${formatDate(t.rental_date)}`
        )}
      </span>
    );
  }
  if (t.reserva_date) {
    return (
      <span className="ml-1 text-xs font-normal text-neutral-400">
        ·{" "}
        {t.calendar_event_id ? (
          <Link href={linkEvento(t.calendar_event_id)} onClick={(e) => e.stopPropagation()} className={link}>
            reserva {formatDate(t.reserva_date)}
          </Link>
        ) : (
          `reserva ${formatDate(t.reserva_date)}`
        )}
      </span>
    );
  }
  if (t.type === "saida" && t.client_id && !t.rental_id && !t.calendar_event_id) {
    return <span className="ml-1 text-xs font-normal text-amber-600">· sem locação</span>;
  }
  return null;
}

export default function FinanceiroClient({
  initialTransactions,
  categories,
  clients,
  nomesCartoes = {},
  filtrado = false,
  periodo,
  atingiuTeto,
  escopo = "harmonize",
  resumoPessoal,
}: {
  initialTransactions: TransactionRow[];
  categories: CategoryRow[];
  clients: ClientOption[];
  nomesCartoes?: Record<string, string>;
  // Busca ou filtro ligado: compras do cartão aparecem uma a uma, não agrupadas por fatura.
  filtrado?: boolean;
  periodo: Periodo;
  atingiuTeto: boolean;
  escopo?: "harmonize" | "pessoal";
  // Só no pessoal: saldo de sempre da conta e as contas fixas pessoais.
  resumoPessoal?: { saldo: number; fixas: { nome: string; valor: number }[] };
}) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const pessoal = escopo === "pessoal";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionRow | null>(null);

  // A filtragem inteira mora na consulta do servidor agora, então o que
  // chega aqui já é o conjunto final. Os totais saem dessas mesmas
  // linhas, de propósito: total calculado por outro caminho é como o
  // faturamento passou a divergir em R$ 39.581,97.
  const totais = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    let emprestado = 0;
    let devolvido = 0;
    let faturasPagas = 0;
    for (const t of initialTransactions) {
      // Pagamento de fatura: as compras do cartão já contaram como saída.
      if (foraDoResultadoPorCartao((t as any).cartao_mov)) {
        faturasPagas += Number(t.amount);
        continue;
      }
      // Empréstimo a terceiros e devolução: caixa, não resultado.
      if (ehCategoriaDeEmprestimo(t.categories?.name)) {
        if (t.type === "entrada") devolvido += Number(t.amount);
        else emprestado += Number(t.amount);
        continue;
      }
      if (t.type === "entrada") entradas += Number(t.amount);
      else saidas += Number(t.amount);
    }
    return { entradas, saidas, resultado: entradas - saidas, emprestado, devolvido, faturasPagas };
  }, [initialTransactions]);

  // As compras do cartão aparecem numa linha por fatura, que abre a tela Cartões.
  const linhas = useMemo(
    () => (filtrado ? initialTransactions.map((item) => ({ tipo: "lancamento" as const, item })) : agruparPorFatura(initialTransactions)),
    [initialTransactions, filtrado]
  );

  function baixarCsv() {
    exportarTabela(
      initialTransactions,
      [
        { titulo: "Data", valor: (t) => formatDate(t.date), tipo: "data" },
        { titulo: "Data da compra (cartão)", valor: (t) => (t.data_compra ? formatDate(t.data_compra) : ""), tipo: "data" },
        { titulo: "Tipo", valor: (t) => (t.type === "entrada" ? "Entrada" : "Saída") },
        { titulo: "Categoria", valor: (t) => t.categories?.name ?? "" },
        { titulo: "Descrição", valor: (t) => t.description },
        { titulo: "Cliente", valor: (t) => t.clients?.name ?? "" },
        {
          titulo: "Locação",
          valor: (t) =>
            t.rental_date ? formatDate(t.rental_date) : t.reserva_date ? `reserva ${formatDate(t.reserva_date)}` : "",
        },
        { titulo: "Valor", valor: (t) => Number(t.amount), tipo: "moeda" },
        { titulo: "Pagamento", valor: (t) => PAYMENT_LABELS[t.payment_method] ?? t.payment_method },
        { titulo: "Teste", valor: (t) => (t.is_test ? "sim" : "") },
      ],
      pessoal ? "financeiro-pessoal" : "financeiro",
      periodo.rotulo,
      {
        titulo: pessoal ? "Financeiro pessoal" : "Financeiro",
        // Os mesmos números do quadro da tela (empréstimo e pagamento de
        // fatura ficam fora do resultado).
        resumo: [
          { rotulo: "Entradas", valor: totais.entradas },
          { rotulo: "Saídas", valor: totais.saidas },
          { rotulo: "Resultado", valor: totais.resultado },
        ],
        // Gráficos sem empréstimo e sem pagamento de fatura, como o resultado.
        graficos: graficosFinanceiro(
          initialTransactions
            .filter((t) => !ehCategoriaDeEmprestimo(t.categories?.name) && !foraDoResultadoPorCartao((t as any).cartao_mov))
            .map((t) => ({ type: t.type, amount: Number(t.amount), date: t.date, categories: t.categories ?? null }))
        ),
      }
    );
  }

  // Lançamento de empréstimo se edita na tela de Empréstimos, para o controle
  // e o lançamento do caixa nunca ficarem diferentes.
  function abrirLancamento(t: TransactionRow) {
    if (somenteLeitura) return;
    // Entrada espelhada de uma Retirada: abre a retirada original.
    if ((t as any).vinculo_id) {
      router.push(`/financeiro?lancamento=${(t as any).vinculo_id}`);
      return;
    }
    if (ehCategoriaDeEmprestimo(t.categories?.name)) {
      router.push("/financeiro/emprestimos");
      return;
    }
    setEditing(t);
  }

  // /financeiro?lancamento=<id>: atalho de outras telas (locação, ficha do
  // cliente, cartões...) que abre direto a edição daquele lançamento, mesmo
  // que ele seja de outro mês.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("lancamento");
    if (!id) return;
    url.searchParams.delete("lancamento");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    const naLista = initialTransactions.find((t) => t.id === id);
    if (naLista) {
      abrirLancamento(naLista);
      return;
    }
    createClient()
      .from("transactions")
      .select(
        "id, type, description, amount, payment_method, date, data_compra, category_id, client_id, rental_id, calendar_event_id, is_test, conta_no_lucro, vinculo_id, cartao_mov, cartao_id, fatura_ref, compra_grupo, categories(name), clients(name)"
      )
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const um = <T,>(v: T | T[] | null) => (Array.isArray(v) ? v[0] ?? null : v);
        abrirLancamento({ ...(data as any), categories: um((data as any).categories), clients: um((data as any).clients) });
      });
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!pessoal && (
        <HeroTela
          etiqueta={`Financeiro · ${periodo.rotulo}`}
          rotulo={totais.resultado >= 0 ? "Sobrou" : "Faltou"}
          valor={formatCurrency(Math.abs(totais.resultado))}
          apoio="Do que está filtrado abaixo, não do caixa inteiro"
          anel={{
            fracao: totais.entradas > 0 ? totais.saidas / totais.entradas : 0,
            texto: totais.entradas > 0 ? `${Math.round((totais.saidas / totais.entradas) * 100)}%` : "-",
            legenda: "gasto",
          }}
          tom={totais.entradas > 0 && totais.saidas > totais.entradas ? "ruim" : totais.entradas > 0 && totais.saidas / totais.entradas > 0.85 ? "alerta" : "ok"}
          chips={[
            { texto: `Entrou ${formatCurrency(totais.entradas)}`, icone: ArrowUpRight, tom: "bom" },
            { texto: `Saiu ${formatCurrency(totais.saidas)}`, icone: ArrowDownRight },
          ]}
        />
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {pessoal ? <h1 className="text-xl font-semibold text-neutral-900">Financeiro pessoal</h1> : <span />}
        <div className="flex gap-2">
          <Link
            href={pessoal ? "/pessoal/cartoes" : "/financeiro/cartoes"}
            className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700"
          >
            Cartões
          </Link>
          {!pessoal && (
            <Link
              href="/financeiro/emprestimos"
              className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700"
            >
              Empréstimos
            </Link>
          )}
          {!somenteLeitura && (
            <button
              onClick={() => setModalOpen(true)}
              className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
            >
              + Novo lançamento
            </button>
          )}
        </div>
      </div>
      {!pessoal && (
        <Link href="/clientes/creditos" className="inline-block text-xs font-medium text-brand-teal-dark">
          Créditos de clientes →
        </Link>
      )}

      {pessoal && resumoPessoal && (
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Saldo da conta pessoal</p>
          <p className={`text-xl font-semibold ${resumoPessoal.saldo >= 0 ? "text-brand-teal" : "text-brand-pink"}`}>
            {formatCurrency(resumoPessoal.saldo)}
          </p>
          <p className="text-[11px] text-neutral-500">
            Tudo que entrou menos tudo que saiu, desde o primeiro lançamento. Retiradas da Harmonize entram aqui sozinhas.
          </p>
          {resumoPessoal.fixas.length > 0 && (
            <div className="mt-3 border-t border-neutral-200/70 pt-2">
              <p className="text-xs font-medium text-neutral-600">
                Contas fixas pessoais do mês: {formatCurrency(resumoPessoal.fixas.reduce((s, f) => s + f.valor, 0))}
              </p>
              <ul className="mt-1 space-y-0.5">
                {resumoPessoal.fixas.map((f) => (
                  <li key={f.nome} className="flex justify-between text-[11px] text-neutral-500">
                    <span>{f.nome}</span>
                    <span>{formatCurrency(f.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <FiltroBarra
        periodoPadrao="mes"
        rotuloPeriodo={periodo.rotulo}
        contagem={{
          mostrando: initialTransactions.length,
          rotulo: initialTransactions.length === 1 ? "lançamento" : "lançamentos",
        }}
        campos={[
          {
            chave: "tipo",
            rotuloVazio: "Entradas e saídas",
            opcoes: [
              { valor: "entrada", label: "Só entradas" },
              { valor: "saida", label: "Só saídas" },
            ],
          },
          {
            chave: "categoria",
            rotuloVazio: "Todas as categorias",
            opcoes: categories.map((c) => ({
              valor: c.id,
              label: `${c.name} (${c.type === "entrada" ? "entrada" : "saída"})`,
            })),
          },
          {
            chave: "pagamento",
            rotuloVazio: "Toda forma de pagamento",
            opcoes: Object.entries(PAYMENT_LABELS).map(([valor, label]) => ({ valor, label })),
          },
          {
            chave: "cliente",
            rotuloVazio: "Todos os clientes",
            opcoes: clients.map((c) => ({ valor: c.id, label: c.name })),
          },
        ]}
        buscaPlaceholder="Buscar na descrição..."
        acoes={
          <button
            type="button"
            onClick={baixarCsv}
            disabled={initialTransactions.length === 0}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50"
          >
            Exportar planilha
          </button>
        }
      />

      {atingiuTeto && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Este período tem mais lançamentos do que a tela carrega de uma vez, então os totais abaixo
          estão incompletos. Escolha um período menor.
        </div>
      )}

      {/* Os totais são do que está filtrado, não do mês inteiro nem de
          sempre. Dizer isso na tela evita ler "Resultado" como o caixa
          da empresa quando há um filtro de categoria ligado. */}
      <div className={pessoal ? "grid grid-cols-3 gap-2" : "hidden"}>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Entradas</p>
          <p className="mt-0.5 text-sm font-semibold text-brand-teal sm:text-base">
            {formatCurrency(totais.entradas)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Saídas</p>
          <p className="mt-0.5 text-sm font-semibold text-brand-pink sm:text-base">
            {formatCurrency(totais.saidas)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl">
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Resultado</p>
          <p
            className={`mt-0.5 text-sm font-semibold sm:text-base ${
              totais.resultado >= 0 ? "text-brand-teal" : "text-brand-pink"
            }`}
          >
            {formatCurrency(totais.resultado)}
          </p>
        </div>
      </div>
      {totais.faturasPagas > 0 && (
        <Link href={pessoal ? "/pessoal/cartoes" : "/financeiro/cartoes"} className="block text-xs text-neutral-500">
          Fora do resultado: faturas de cartão pagas {formatCurrency(totais.faturasPagas)} (as compras já contaram) →
        </Link>
      )}
      {(totais.emprestado > 0 || totais.devolvido > 0) && (
        <Link href="/financeiro/emprestimos" className="block text-xs text-neutral-500">
          Fora do resultado: empréstimos {formatCurrency(totais.emprestado)} saíram
          {totais.devolvido > 0 ? `, ${formatCurrency(totais.devolvido)} voltaram` : ""} →
        </Link>
      )}

      {/* Celular: lista de cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {linhas.map((linha) => {
          if (linha.tipo === "fatura") {
            return (
              <Link
                key={linha.chave}
                href={linkFatura(escopo, linha.cartao_id, linha.fatura_ref)}
                className="block rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-neutral-900">Fatura {nomesCartoes[linha.cartao_id] ?? "do cartão"}</p>
                    <p className="mt-0.5 text-xs text-neutral-500">
                      {rotuloFatura(linha.fatura_ref)} · vence {formatDate(linha.itens[0].date)} · {linha.itens.length}{" "}
                      {linha.itens.length === 1 ? "compra" : "compras"}
                    </p>
                  </div>
                  <span className="whitespace-nowrap rounded-full bg-brand-pink/10 px-2 py-0.5 text-xs font-medium text-brand-pink">Saída</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-neutral-500">Crédito · ver as compras →</span>
                  <span className="font-medium text-brand-pink">{formatCurrency(linha.total)}</span>
                </div>
              </Link>
            );
          }
          const t = linha.item;
          return (
          <div
            key={t.id}
            onClick={() => abrirLancamento(t)}
            className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">
                  {t.description}
                  {t.is_test && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-amber-700">
                      TESTE
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatDate(t.data_compra ?? t.date)} · {t.categories?.name ?? "-"}
                  {t.clients?.name && (
                    <>
                      {" · "}
                      <LinkCliente id={t.client_id}>{t.clients.name}</LinkCliente>
                    </>
                  )}
                  {vinculoLocacao(t)}
                  {(t as any).conta_no_lucro && <span className="ml-1 text-xs text-amber-600">· custo de atendimento</span>}
                </p>
              </div>
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
                  t.type === "entrada" ? "bg-brand-teal/10 text-brand-teal" : "bg-brand-pink/10 text-brand-pink"
                }`}
              >
                {t.type === "entrada" ? "Entrada" : "Saída"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-neutral-500">{PAYMENT_LABELS[t.payment_method] ?? t.payment_method}</span>
              <span
                className={`font-medium ${t.type === "entrada" ? "text-brand-teal" : "text-brand-pink"}`}
              >
                {formatCurrency(Number(t.amount))}
              </span>
            </div>
          </div>
          );
        })}
        {initialTransactions.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl">
            Nenhum lançamento em {periodo.rotulo}.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Pagamento</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha) => {
              if (linha.tipo === "fatura") {
                return (
                  <tr
                    key={linha.chave}
                    onClick={() => router.push(linkFatura(escopo, linha.cartao_id, linha.fatura_ref))}
                    className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{formatDate(linha.itens[0].date)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="rounded-full bg-brand-pink/10 px-2 py-0.5 text-xs font-medium text-brand-pink">Saída</span>
                    </td>
                    <td className="px-4 py-3 text-neutral-600">Cartão</td>
                    <td className="px-4 py-3 text-neutral-900">
                      Fatura {nomesCartoes[linha.cartao_id] ?? "do cartão"} {rotuloFatura(linha.fatura_ref)}
                      <span className="ml-1 text-xs font-normal text-neutral-400">
                        · {linha.itens.length} {linha.itens.length === 1 ? "compra" : "compras"} · ver as compras →
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-brand-pink">{formatCurrency(linha.total)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">Crédito</td>
                  </tr>
                );
              }
              const t = linha.item;
              return (
              <tr
                key={t.id}
                onClick={() => abrirLancamento(t)}
                className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">{formatDate(t.date)}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.type === "entrada" ? "bg-brand-teal/10 text-brand-teal" : "bg-brand-pink/10 text-brand-pink"
                    }`}
                  >
                    {t.type === "entrada" ? "Entrada" : "Saída"}
                  </span>
                </td>
                <td className="px-4 py-3 text-neutral-600">{t.categories?.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-900">
                  {t.description}
                  {t.is_test && (
                    <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      TESTE
                    </span>
                  )}
                  {t.clients?.name && (
                    <span className="ml-1 text-xs font-normal text-neutral-400">
                      · <LinkCliente id={t.client_id}>{t.clients.name}</LinkCliente>
                    </span>
                  )}
                  {vinculoLocacao(t)}
                  {(t as any).conta_no_lucro && <span className="ml-1 text-xs text-amber-600">· custo de atendimento</span>}
                </td>
                <td
                  className={`whitespace-nowrap px-4 py-3 text-right font-medium ${
                    t.type === "entrada" ? "text-brand-teal" : "text-brand-pink"
                  }`}
                >
                  {formatCurrency(Number(t.amount))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {PAYMENT_LABELS[t.payment_method] ?? t.payment_method}
                </td>
              </tr>
              );
            })}
            {initialTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                  Nenhum lançamento em {periodo.rotulo}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <NovoLancamentoModal
          categories={pessoal ? categories.filter((c) => (c as any).scope === "harmonize") : categories}
          clients={clients}
          escopoInicial={escopo}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editing && (
        <EditarLancamentoModal
          transaction={editing}
          categories={categories}
          clients={clients}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
          onDeleted={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
