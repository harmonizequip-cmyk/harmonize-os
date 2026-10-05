"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PIX_CONTAS } from "@/lib/rental-calculator";
import { buildWhatsAppLink, formatCurrency, formatDate } from "@/lib/format";
import { buildCobrancaMessage, buildCobrancaTaxaMessage } from "@/lib/cobranca";
import { exportarCsv } from "@/lib/exportar-csv";
import type { Pendencias, PendenciaLocacao, TaxaVencida, ReservaSemDisparos } from "@/lib/pendencias";

type Ordem = "valor" | "atraso";

export default function PendenciasClient({
  pendencias,
  taxas,
  semDisparos,
  diasCobrancaTaxa,
}: {
  pendencias: Pendencias;
  taxas: TaxaVencida[];
  semDisparos: ReservaSemDisparos[];
  diasCobrancaTaxa: number;
}) {
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<Ordem>("valor");
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  // Registrar pagamento direto daqui, sem abrir o cliente.
  const router = useRouter();
  const supabase = createClient();
  const [pagando, setPagando] = useState<string | null>(null);
  const [pagValor, setPagValor] = useState("");
  const [pagForma, setPagForma] = useState("pix");
  const [pagConta, setPagConta] = useState<string>("harmonize");
  const [pagSalvando, setPagSalvando] = useState(false);
  const [pagErro, setPagErro] = useState<string | null>(null);

  function abrirPagamento(l: PendenciaLocacao) {
    setPagando(l.rentalId);
    setPagValor(l.saldo.toFixed(2).replace(".", ","));
    setPagForma("pix");
    setPagConta("harmonize");
    setPagErro(null);
  }

  async function salvarPagamento(l: PendenciaLocacao) {
    const valor = Number(pagValor.replace(/\./g, "").replace(",", "."));
    if (!valor || valor <= 0) {
      setPagErro("Informe um valor válido.");
      return;
    }
    if (valor > l.saldo + 0.001) {
      setPagErro(`O valor é maior que o saldo em aberto (${formatCurrency(l.saldo)}).`);
      return;
    }
    setPagSalvando(true);
    setPagErro(null);
    const { error } = await supabase.rpc("registrar_pagamento_locacao", {
      p_rental_id: l.rentalId,
      p_forma: pagForma,
      p_valor: valor,
      p_pix_conta: pagForma === "pix" ? pagConta : null,
    });
    setPagSalvando(false);
    if (error) {
      setPagErro(error.message || "Não foi possível registrar o pagamento.");
      return;
    }
    setPagando(null);
    router.refresh();
  }

  const clientes = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = pendencias.clientes.filter((c) => !termo || c.cliente.toLowerCase().includes(termo));
    return [...lista].sort((a, b) => (ordem === "valor" ? b.total - a.total : b.maiorAtraso - a.maiorAtraso));
  }, [pendencias.clientes, busca, ordem]);

  function alternar(id: string) {
    setAbertos((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function baixarCsv() {
    exportarCsv<PendenciaLocacao>(
      pendencias.locacoes,
      [
        { titulo: "Cliente", valor: (l) => l.cliente },
        { titulo: "Data da locação", valor: (l) => formatDate(l.eventDate) },
        { titulo: "Valor da locação", valor: (l) => l.valor },
        { titulo: "Taxa de reserva paga", valor: (l) => l.credito },
        { titulo: "Já pago", valor: (l) => l.pago },
        { titulo: "Saldo em aberto", valor: (l) => l.saldo },
        { titulo: "Dias em atraso", valor: (l) => l.diasAtraso },
        { titulo: "WhatsApp", valor: (l) => l.whatsapp },
      ],
      "pendencias-de-pagamento"
    );
  }

  const card =
    "rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Pendências de pagamento</h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Locações que já aconteceram e ainda têm saldo a receber, já descontando taxa de reserva paga e
            pagamentos parciais.
          </p>
        </div>
        <button
          type="button"
          onClick={baixarCsv}
          disabled={pendencias.locacoes.length === 0}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
        >
          Exportar CSV
        </button>
      </div>

      {semDisparos.length > 0 && (
        <div id="sem-disparos" className="scroll-mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
              Atendimentos sem disparos lançados ({semDisparos.length})
            </p>
            <p className="text-xs text-amber-800/80 dark:text-amber-400/80">
              A data já passou e ninguém lançou os disparos, então ainda não viraram cobrança. Abra na agenda e
              use "Finalizar com disparos". Se não aconteceu, cancele a reserva.
            </p>
          </div>
          {semDisparos.map((r) => (
            <Link
              key={r.chave}
              href={`/agenda?date=${r.de}`}
              className="flex items-baseline justify-between gap-2 rounded-xl bg-white/70 p-2.5 dark:bg-neutral-900/55"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{r.cliente}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {r.equipamento ? `${r.equipamento} · ` : ""}
                  {r.de === r.ate ? formatDate(r.de) : `${formatDate(r.de)} a ${formatDate(r.ate)} (${r.dias} dias)`} ·
                  terminou há {r.diasDesde} {r.diasDesde === 1 ? "dia" : "dias"}
                </p>
              </div>
              <span className="whitespace-nowrap text-xs font-medium text-amber-700 dark:text-amber-400">
                Abrir na agenda →
              </span>
            </Link>
          ))}
        </div>
      )}

      {taxas.length > 0 && (
        <div id="taxas" className="scroll-mt-4 space-y-2 rounded-2xl border border-red-200 bg-red-50/70 p-3 dark:border-red-900/40 dark:bg-red-900/10">
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">
              Taxas de reserva vencidas ({taxas.length})
            </p>
            <p className="text-xs text-red-700/80 dark:text-red-400/80">
              Reservas com a taxa sem pagar há mais de {diasCobrancaTaxa} dias e data ainda por vir.
            </p>
          </div>
          {taxas.map((t) => {
            const whatsapp = buildWhatsAppLink(
              t.whatsapp,
              buildCobrancaTaxaMessage({
                name: t.cliente,
                treatment: t.treatment,
                displayName: t.displayName,
                dataEvento: t.dataEvento,
                valor: t.valor,
              })
            );
            return (
              <div key={t.eventId} className="rounded-xl bg-white/70 p-2.5 dark:bg-neutral-900/55">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {t.cliente}
                  </p>
                  {t.valor > 0 && (
                    <p className="text-sm font-semibold text-red-700 dark:text-red-400">{formatCurrency(t.valor)}</p>
                  )}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Reserva para {formatDate(t.dataEvento)} · taxa sem pagar há {t.diasSemPagar}{" "}
                  {t.diasSemPagar === 1 ? "dia" : "dias"}
                </p>
                <div className="mt-2 flex gap-2">
                  {whatsapp && (
                    <a
                      href={whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg border border-brand-teal py-1.5 text-center text-xs font-medium text-brand-teal"
                    >
                      Cobrar taxa no WhatsApp
                    </a>
                  )}
                  <Link
                    href="/agenda"
                    className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Abrir na agenda
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className={`${card} col-span-2 sm:col-span-1`}>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Total a receber</p>
          <p className="mt-0.5 text-lg font-semibold text-amber-600 dark:text-amber-400">
            {formatCurrency(pendencias.total)}
          </p>
        </div>
        <div className={card}>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Clientes devendo</p>
          <p className="mt-0.5 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            {pendencias.clientes.length}
          </p>
        </div>
        <div className={card}>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Locações em aberto</p>
          <p className="mt-0.5 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            {pendencias.locacoes.length}
          </p>
        </div>
        <div className={card}>
          <p className="text-[11px] uppercase tracking-wide text-neutral-400">Maior atraso</p>
          <p className="mt-0.5 text-lg font-semibold text-neutral-800 dark:text-neutral-100">
            {pendencias.maiorAtraso} {pendencias.maiorAtraso === 1 ? "dia" : "dias"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..."
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          <option value="valor">Maior valor primeiro</option>
          <option value="atraso">Mais antigo primeiro</option>
        </select>
      </div>

      {pendencias.clientes.length === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-neutral-500 dark:text-neutral-400`}>
          Nenhum cliente devendo. Todas as locações que já aconteceram estão pagas. 🎉
        </div>
      ) : clientes.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nenhum cliente encontrado para essa busca.</p>
      ) : (
        <div className="space-y-2">
          {clientes.map((c) => {
            const aberto = abertos.has(c.clientId);
            const mensagem = buildCobrancaMessage({
              name: c.cliente,
              treatment: c.treatment,
              displayName: c.displayName,
              locacoes: c.locacoes,
            });
            const whatsapp = buildWhatsAppLink(c.whatsapp, mensagem);
            return (
              <div key={c.clientId} className={card}>
                <button type="button" onClick={() => alternar(c.clientId)} className="flex w-full items-center gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{c.cliente}</p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {c.locacoes.length} {c.locacoes.length === 1 ? "locação" : "locações"} · mais antiga há{" "}
                      {c.maiorAtraso} {c.maiorAtraso === 1 ? "dia" : "dias"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(c.total)}</p>
                  <span className="text-xs text-neutral-400">{aberto ? "▲" : "▼"}</span>
                </button>

                {aberto && (
                  <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
                    {c.locacoes.map((l) => (
                      <div key={l.rentalId} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                        <span className="text-neutral-700 dark:text-neutral-300">
                          {formatDate(l.eventDate)}
                          {l.eventDateEnd && l.eventDateEnd !== l.eventDate ? ` a ${formatDate(l.eventDateEnd)}` : ""}
                          <span className="ml-2 text-neutral-400">há {l.diasAtraso} {l.diasAtraso === 1 ? "dia" : "dias"}</span>
                        </span>
                        <span className="text-neutral-500 dark:text-neutral-400">
                          {formatCurrency(l.valor)}
                          {l.credito > 0 && ` · taxa paga ${formatCurrency(l.credito)}`}
                          {l.pago > 0 && ` · pago ${formatCurrency(l.pago)}`}
                          <span className="ml-2 font-medium text-amber-600 dark:text-amber-400">
                            falta {formatCurrency(l.saldo)}
                          </span>
                        </span>
                      </div>
                      {pagando === l.rentalId ? (
                        <div className="space-y-2 rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-2.5">
                          <div className="flex flex-wrap gap-2">
                            <input
                              value={pagValor}
                              onChange={(e) => setPagValor(e.target.value)}
                              inputMode="decimal"
                              aria-label="Valor recebido"
                              className="w-28 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                            />
                            <select
                              value={pagForma}
                              onChange={(e) => setPagForma(e.target.value)}
                              aria-label="Forma de pagamento"
                              className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                            >
                              <option value="pix">PIX</option>
                              <option value="dinheiro">Dinheiro</option>
                              <option value="debito">Débito</option>
                              <option value="credito">Crédito</option>
                              <option value="transferencia">Transferência</option>
                              <option value="outros">Outros</option>
                            </select>
                            {pagForma === "pix" && (
                              <select
                                value={pagConta}
                                onChange={(e) => setPagConta(e.target.value)}
                                aria-label="Conta PIX que recebeu"
                                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                              >
                                {PIX_CONTAS.map((c) => (
                                  <option key={c.value} value={c.value}>
                                    {c.nome}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                          {pagErro && <p className="text-xs text-red-600 dark:text-red-400">{pagErro}</p>}
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={pagSalvando}
                              onClick={() => salvarPagamento(l)}
                              className="flex-1 rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              {pagSalvando ? "Salvando..." : "Confirmar recebimento"}
                            </button>
                            <button
                              type="button"
                              disabled={pagSalvando}
                              onClick={() => setPagando(null)}
                              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirPagamento(l)}
                          className="w-full rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white"
                        >
                          Registrar pagamento de {formatDate(l.eventDate)}
                        </button>
                      )}
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      {whatsapp && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 rounded-lg border border-brand-teal py-1.5 text-center text-xs font-medium text-brand-teal"
                        >
                          Cobrar no WhatsApp
                        </a>
                      )}
                      <Link
                        href={`/clientes/${c.clientId}`}
                        className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                      >
                        Abrir cliente
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
