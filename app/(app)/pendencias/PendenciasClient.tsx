"use client";

import { useMemo, useState } from "react";
import MenuAtalhosCliente from "@/components/MenuAtalhosCliente";
import Link from "next/link";
import { Clock, Users, Wallet } from "lucide-react";
import HeroTela from "@/components/ui/HeroTela";
import { buildWhatsAppLink, formatCurrency, formatDate } from "@/lib/format";
import { buildCobrancaMessage, buildCobrancaTaxaMessage } from "@/lib/cobranca";
import { exportarTabela } from "@/lib/exportar-planilha";
import { barras, rankingPor, soGraficos } from "@/lib/graficos-exportacao";
import ReceberPagamentoBotao from "@/components/ReceberPagamentoBotao";
import TaxaRecebidaBotao from "@/components/TaxaRecebidaBotao";
import { Atalho, Atalhos, LinkCliente } from "@/components/Atalhos";
import { linkCliente, linkEvento, linkLocacao } from "@/lib/atalhos";
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
    exportarTabela<PendenciaLocacao>(
      pendencias.locacoes,
      [
        { titulo: "Cliente", valor: (l) => l.cliente },
        { titulo: "Data da locação", valor: (l) => formatDate(l.eventDate), tipo: "data" },
        { titulo: "Valor da locação", valor: (l) => l.valor, tipo: "moeda", total: true },
        { titulo: "Taxa de reserva paga", valor: (l) => l.credito, tipo: "moeda", total: true },
        { titulo: "Já pago", valor: (l) => l.pago, tipo: "moeda", total: true },
        { titulo: "Saldo em aberto", valor: (l) => l.saldo, tipo: "moeda", total: true },
        { titulo: "Dias em atraso", valor: (l) => l.diasAtraso, tipo: "inteiro" },
        { titulo: "WhatsApp", valor: (l) => l.whatsapp },
      ],
      "pendencias-de-pagamento",
      undefined,
      {
        titulo: "Pendências de pagamento",
        graficos: soGraficos([
          barras("Saldo em aberto por cliente", rankingPor(pendencias.locacoes, (l) => l.cliente, (l) => l.saldo, 10), { serie: "Saldo em aberto", cor: "#D9577E" }),
        ]),
      }
    );
  }

  const card =
    "rounded-2xl border border-white/60 bg-white/70 p-3 backdrop-blur-xl";

  return (
    <div className="space-y-4">
      <HeroTela
        etiqueta="Pendências de pagamento"
        rotulo="Total a receber"
        valor={formatCurrency(pendencias.total)}
        apoio="Locações que já aconteceram, já descontando taxa de reserva paga e pagamentos parciais"
        tom={pendencias.maiorAtraso >= 15 ? "ruim" : pendencias.total > 0 ? "alerta" : "ok"}
        chips={[
          { texto: `${pendencias.clientes.length} ${pendencias.clientes.length === 1 ? "cliente devendo" : "clientes devendo"}`, icone: Users },
          { texto: `${pendencias.locacoes.length} ${pendencias.locacoes.length === 1 ? "locação" : "locações"} em aberto`, icone: Wallet },
          ...(pendencias.maiorAtraso > 0
            ? [{ texto: `Maior atraso ${pendencias.maiorAtraso} ${pendencias.maiorAtraso === 1 ? "dia" : "dias"}`, icone: Clock, tom: (pendencias.maiorAtraso >= 15 ? "ruim" : "neutro") as "ruim" | "neutro" }]
            : []),
        ]}
      >
        <button
          type="button"
          onClick={baixarCsv}
          disabled={pendencias.locacoes.length === 0}
          className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Exportar planilha
        </button>
      </HeroTela>

      {semDisparos.length > 0 && (
        <div id="sem-disparos" className="scroll-mt-4 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Atendimentos sem disparos lançados ({semDisparos.length})
            </p>
            <p className="text-xs text-amber-800/80">
              A data já passou e ninguém lançou os disparos, então ainda não viraram cobrança. Abra na agenda e
              use "Finalizar com disparos". Se não aconteceu, cancele a reserva.
            </p>
          </div>
          {semDisparos.map((r) => (
            // Div e não link: o nome leva à ficha e o resto ao atendimento
            // (chave = id do primeiro evento do grupo), sem link dentro de link.
            <div key={r.chave} className="flex items-baseline justify-between gap-2 rounded-xl bg-white/70 p-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">
                  <LinkCliente id={r.clientId}>{r.cliente}</LinkCliente>
                </p>
                <Link href={linkEvento(r.chave)} className="block text-xs text-neutral-500">
                  {r.equipamento ? `${r.equipamento} · ` : ""}
                  {r.de === r.ate ? formatDate(r.de) : `${formatDate(r.de)} a ${formatDate(r.ate)} (${r.dias} dias)`} ·
                  terminou há {r.diasDesde} {r.diasDesde === 1 ? "dia" : "dias"}
                </Link>
              </div>
              <Link href={linkEvento(r.chave)} className="whitespace-nowrap text-xs font-medium text-amber-700">
                Abrir na agenda →
              </Link>
            </div>
          ))}
        </div>
      )}

      {taxas.length > 0 && (
        <div
          id="taxas"
          className={`scroll-mt-4 space-y-2 rounded-2xl border p-3 ${
            taxas.some((t) => t.vencida)
              ? "border-red-200 bg-red-50/70"
              : "border-amber-200 bg-amber-50/70"
          }`}
        >
          <div>
            <p className="text-sm font-semibold text-red-700">
              Taxas de reserva a receber ({taxas.length})
            </p>
            <p className="text-xs text-red-700/80">
              Reservas com a taxa ainda sem pagar e data por vir. Vencida = mais de {diasCobrancaTaxa} dias sem
              pagar. Ao receber, toque em "Taxa recebida".
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
              <div key={t.eventId} className="rounded-xl bg-white/70 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-900">
                    {t.cliente}
                    {t.vencida && (
                      <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        vencida
                      </span>
                    )}
                  </p>
                  {t.valor > 0 && (
                    <p className="text-sm font-semibold text-red-700">{formatCurrency(t.valor)}</p>
                  )}
                  {t.clientId && <MenuAtalhosCliente clienteId={t.clientId} nome={t.cliente} eventoId={t.eventId} className="-mr-2 flex-shrink-0" />}
                </div>
                <p className="text-xs text-neutral-500">
                  Reserva para {formatDate(t.dataEvento)} · taxa sem pagar há {t.diasSemPagar}{" "}
                  {t.diasSemPagar === 1 ? "dia" : "dias"}
                </p>
                {t.clientId && (
                  <Atalhos className="mt-1.5">
                    <Atalho href={linkCliente(t.clientId)} emoji="👤">Ficha</Atalho>
                  </Atalhos>
                )}
                <div className="mt-2 space-y-2">
                  <TaxaRecebidaBotao eventId={t.eventId} valor={t.valor} />
                  <div className="flex gap-2">
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
                      href={linkEvento(t.eventId)}
                      className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-medium text-neutral-600"
                    >
                      Abrir na agenda
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..."
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <select
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as Ordem)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="valor">Maior valor primeiro</option>
          <option value="atraso">Mais antigo primeiro</option>
        </select>
      </div>

      {pendencias.clientes.length === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-neutral-500`}>
          Nenhum cliente devendo. Todas as locações que já aconteceram estão pagas. 🎉
        </div>
      ) : clientes.length === 0 ? (
        <p className="text-sm text-neutral-500">Nenhum cliente encontrado para essa busca.</p>
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
                <div className="flex items-center gap-1">
                <button type="button" onClick={() => alternar(c.clientId)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-neutral-900">{c.cliente}</p>
                    <p className="text-xs text-neutral-500">
                      {c.locacoes.length} {c.locacoes.length === 1 ? "locação" : "locações"} · mais antiga há{" "}
                      {c.maiorAtraso} {c.maiorAtraso === 1 ? "dia" : "dias"}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-amber-600">{formatCurrency(c.total)}</p>
                  <span className="text-xs text-neutral-400">{aberto ? "▲" : "▼"}</span>
                </button>
                <MenuAtalhosCliente clienteId={c.clientId} nome={c.cliente} whatsapp={c.whatsapp} className="-mr-2 flex-shrink-0" />
                </div>

                {aberto && (
                  <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
                    {c.locacoes.map((l) => (
                      <div key={l.rentalId} className="space-y-1.5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs">
                        <span className="text-neutral-700">
                          {formatDate(l.eventDate)}
                          {l.eventDateEnd && l.eventDateEnd !== l.eventDate ? ` a ${formatDate(l.eventDateEnd)}` : ""}
                          <span className="ml-2 text-neutral-400">há {l.diasAtraso} {l.diasAtraso === 1 ? "dia" : "dias"}</span>
                        </span>
                        <span className="text-neutral-500">
                          {formatCurrency(l.valor)}
                          {l.credito > 0 && ` · taxa paga ${formatCurrency(l.credito)}`}
                          {l.pago > 0 && ` · pago ${formatCurrency(l.pago)}`}
                          <span className="ml-2 font-medium text-amber-600">
                            falta {formatCurrency(l.saldo)}
                          </span>
                        </span>
                      </div>
                      <Atalhos>
                        <Atalho href={linkLocacao(c.clientId, l.rentalId)} emoji="📦">Abrir locação</Atalho>
                      </Atalhos>
                      <ReceberPagamentoBotao
                        rentalId={l.rentalId}
                        saldo={l.saldo}
                        rotulo={`Registrar pagamento de ${formatDate(l.eventDate)}`}
                      />
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
                        className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-medium text-neutral-600"
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
