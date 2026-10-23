"use client";

import RelacaoFicha from "@/components/RelacaoFicha";
import type { PessoaClassificada } from "@/lib/relacionamento";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText } from "lucide-react";
import { formatCurrency, formatDate, buildMapsLink, buildWazeLink, buildWhatsAppLink } from "@/lib/format";
import type { PricingConfig } from "@/lib/rental-pricing";
import { hojeLocal } from "@/lib/period";
import CalculadoraLocacaoModal from "@/components/CalculadoraLocacaoModal";
import GerarContratoModal, { type OrigemContrato } from "@/components/GerarContratoModal";
import EditarClienteModal from "./EditarClienteModal";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import EditarLocacaoModal from "./EditarLocacaoModal";
import ReservarHiproModal from "../../agenda/ReservarHiproModal";
import ReceberPagamentoBotao from "@/components/ReceberPagamentoBotao";
import TaxaRecebidaBotao from "@/components/TaxaRecebidaBotao";
import { confirmar, avisar } from "@/components/Dialogos";
import { createClient } from "@/lib/supabase/client";
import HistoricoClienteSection from "./HistoricoClienteSection";
import AcessoPlanejadorCard from "@/components/AcessoPlanejadorCard";
import CreditosClienteCard from "@/components/CreditosClienteCard";
import { Atalho, Atalhos } from "@/components/Atalhos";
import { linkEvento, linkLancamentosCliente, linkLocacoesCliente, linkNovoPlanejamento, linkTarefasCliente } from "@/lib/atalhos";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  permuta: "Permuta",
  outros: "Outros",
};

interface Client {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  parceiro?: boolean;
  isento_taxa?: boolean;
  indicado_por?: string | null;
  treatment?: string | null;
  display_name?: string | null;
  // Leva W/X: documento e dados alternativos usados na geração do
  // contrato de locação e da NF-e.
  document?: string | null;
  contrato_nome?: string | null;
  contrato_endereco?: string | null;
}

interface RentalRow {
  id: string;
  event_date: string;
  // Leva W: data final quando a locação cobre mais de um dia. Nulo/ausente =
  // locação de um dia só (o caso comum).
  event_date_end?: string | null;
  shots: number;
  calculated_value: number;
  payment_method: string;
  status: string;
  rescheduled: boolean;
  equipment_id: string;
  notes: string | null;
  // Saldo em aberto e total já pago (view rentals_situacao_pagamento).
  pago?: boolean;
  saldo?: number;
  totalPago?: number;
  equipments?: { name: string; serial_number?: string | null; anvisa_registro?: string | null } | null;
  // Atendimento da Agenda ligado à locação (atalho 📅).
  eventId?: string | null;
}

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

// Leva Y: pré-reserva ("Agendar sem disparos") ainda sem disparos/valor
// combinados — mostrada numa seção separada, "Próximos agendamentos",
// porque é aí que o contrato precisa poder ser gerado: antes do
// procedimento, quando ainda não existe nenhuma linha em `rentals`.
interface PreReservaRow {
  id: string;
  event_date: string;
  event_date_end?: string | null;
  equipment_id: string;
  taxa_status?: string | null;
  equipments?: { name: string; serial_number?: string | null; anvisa_registro?: string | null } | null;
}

// Leva W: mostra o período completo quando a locação (ou pré-reserva)
// cobre mais de um dia (event_date_end preenchido e diferente da data
// inicial); senão mostra só a data única, igual sempre foi.
// Tem dinheiro a receber: não cancelada, não paga e com saldo na view.
function temSaldo(r: RentalRow): boolean {
  return r.status !== "cancelada" && !r.pago && Number(r.saldo ?? 0) > 0.009;
}

// Volta a cobrar a taxa de uma reserva isentada ("Isentar taxa" avisa que é
// por aqui). Mesma chamada do "Cobrar taxa" de AgendamentosDoCliente.
function CobrarTaxaBotao({ eventId, onFeito, className }: { eventId: string; onFeito: () => void; className?: string }) {
  const [trabalhando, setTrabalhando] = useState(false);
  async function cobrar() {
    const ok = await confirmar({
      titulo: "Voltar a cobrar a taxa de reserva?",
      texto: "A taxa volta a ficar pendente nesta reserva.",
      confirmar: "Cobrar taxa",
    });
    if (!ok) return;
    setTrabalhando(true);
    const { error } = await createClient().rpc("definir_taxa_agendamento", {
      p_event_id: eventId,
      p_status: "pendente",
      p_payment_method: "pix",
    });
    setTrabalhando(false);
    if (error) {
      avisar(error.message || "Não consegui voltar a cobrar a taxa.", "erro");
      return;
    }
    avisar("Taxa de reserva voltou a ser cobrada.");
    onFeito();
  }
  return (
    <button
      type="button"
      disabled={trabalhando}
      onClick={cobrar}
      className={`inline-flex min-h-[40px] items-center justify-center rounded-lg border border-neutral-200 px-3 text-xs font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal disabled:opacity-50 ${className ?? ""}`}
    >
      {trabalhando ? "Salvando..." : "Cobrar taxa"}
    </button>
  );
}

function formatPeriodo(r: { event_date: string; event_date_end?: string | null }): string {
  if (r.event_date_end && r.event_date_end !== r.event_date) {
    return `${formatDate(r.event_date)} a ${formatDate(r.event_date_end)}`;
  }
  return formatDate(r.event_date);
}

// Abre um link numa aba nova. Eram tags de link comuns antes, mas botão
// evita o bloqueio de pop-up herdado, mantém o mesmo visual, e evita a
// tag de link ser corrompida numa aplicação manual via GitHub.
function openInNewTab(url: string) {
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

export default function ClienteDetailClient({
  relacao,
  indicador,
  indicados,
  client,
  rentals,
  preReservas,
  billableCount,
  billableTotal,
  equipments,
  pricingConfig,
  reservationFee,
  reagendadasPreReservaCount,
}: {
  relacao?: PessoaClassificada | null;
  // Item 7: quem indicou este cliente e a lista de quem ele indicou.
  indicador: { id: string; name: string } | null;
  indicados: { id: string; name: string }[];
  client: Client;
  rentals: RentalRow[];
  // Leva Y: agendamentos futuros ainda sem disparos ("Agendar sem
  // disparos"), separados do histórico porque é aí que mora o botão de
  // gerar contrato antes do procedimento acontecer.
  preReservas: PreReservaRow[];
  // Contagem e soma já calculadas no servidor a partir da view
  // rentals_contabilizaveis (exclui cancelada e modo teste). Não dá pra
  // recalcular aqui a partir de `rentals`, porque essa lista é a do
  // histórico e inclui as canceladas de propósito.
  billableCount: number;
  billableTotal: number;
  equipments: EquipmentOption[];
  pricingConfig?: PricingConfig;
  reservationFee?: number;
  // Pré-reservas reagendadas (ainda sem rental_id) contadas no servidor
  // em calendar_events, somadas às de `rentals` para o badge "reagendadas".
  reagendadasPreReservaCount: number;
}) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const [modalOpen, setModalOpen] = useState(false);
  const [reservaOpen, setReservaOpen] = useState(false);
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [editingRental, setEditingRental] = useState<RentalRow | null>(null);
  const [contratoOrigem, setContratoOrigem] = useState<OrigemContrato | null>(null);

  // /clientes/<id>?acao=agendar|locacao: atalho do menu dos cartões (components/MenuAtalhosCliente)
  // que abre direto "Agendar sem disparos" ou "+ Nova locação" desta ficha.
  useEffect(() => {
    const url = new URL(window.location.href);
    const acao = url.searchParams.get("acao");
    if (acao !== "agendar" && acao !== "locacao") return;
    url.searchParams.delete("acao");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    if (somenteLeitura) return;
    if (acao === "agendar") setReservaOpen(true);
    else setModalOpen(true);
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // /clientes/<id>?locacao=<rentalId>: atalho de outras telas (Agenda,
  // Financeiro, Locações, Contratos...) que abre direto aquela locação.
  useEffect(() => {
    const url = new URL(window.location.href);
    const id = url.searchParams.get("locacao");
    if (!id) return;
    url.searchParams.delete("locacao");
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    const r = rentals.find((x) => x.id === id);
    if (r) setEditingRental(r);
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mesma régua do faturado: locação cancelada não conta.
  const totalLocacoes = billableCount;
  // Faturado e ticket médio saem da contagem contabilizável, não do
  // tamanho da lista do histórico. Locação cancelada continua aparecendo
  // na tabela abaixo, mas não entra em nenhum dos dois números.
  const totalFaturado = billableTotal;
  const ticketMedio = billableCount > 0 ? billableTotal / billableCount : 0;
  // Realizada = já aconteceu e não foi cancelada. O status "realizada" do
  // banco quase nunca é marcado à mão, então a tela deriva pela data.
  const hojeStr = hojeLocal();
  // A lista vem em ordem crescente: a última é a mais recente não cancelada
  // que já começou (reserva futura não é "última locação").
  const ultimaLocacao = rentals
    .filter((r) => r.status !== "cancelada" && r.event_date <= hojeStr)
    .reduce<string | undefined>((ult, r) => (!ult || r.event_date > ult ? r.event_date : ult), undefined);
  // "Cobrar taxa" só onde faz sentido: reserva futura isentada, cliente que paga taxa.
  const podeCobrarTaxa = (pr: PreReservaRow) =>
    !somenteLeitura && pr.taxa_status === "nao_aplica" && !client.parceiro && !client.isento_taxa && pr.event_date >= hojeStr;
  const situacaoDe = (r: RentalRow): string =>
    r.status === "cancelada"
      ? "cancelada"
      : r.status === "realizada" || (r.event_date_end ?? r.event_date) < hojeStr
        ? "realizada"
        : r.status;
  const concluidas = rentals.filter((r) => situacaoDe(r) === "realizada").length;
  const canceladas = rentals.filter((r) => r.status === "cancelada").length;
  const reagendadas = rentals.filter((r) => r.rescheduled).length + reagendadasPreReservaCount;

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href="/clientes" className="text-sm text-neutral-400 hover:text-neutral-600">
          ← Clientes
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900">{client.name}</h1>
            <button
              onClick={() => setEditClientOpen(true)}
              className="text-xs text-brand-teal underline underline-offset-2"
            >
              Editar
            </button>
          </div>
          {client.clinic_name && <p className="text-sm text-neutral-500">{client.clinic_name}</p>}
          {relacao && <RelacaoFicha p={relacao} />}
          {!somenteLeitura && (
            <Link href={`/assistente?cliente=${client.id}`} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-teal-dark">
              ✨ Conversar com o assistente sobre este cliente
            </Link>
          )}
          <Atalhos className="mt-2">
            <Atalho href={linkLancamentosCliente(client.id)} emoji="💰">Lançamentos</Atalho>
            <Atalho href={linkLocacoesCliente(client.id)} emoji="📦">Locações</Atalho>
            <Atalho href={linkTarefasCliente(client.id)} emoji="🗒️">Tarefas</Atalho>
            <Atalho href={`/planejador?cliente=${client.id}`} emoji="📋">Planejamentos</Atalho>
            {!somenteLeitura && (
              <Atalho href={linkNovoPlanejamento(client.id)} emoji="📋">Novo planejamento</Atalho>
            )}
          </Atalhos>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setReservaOpen(true)}
            className="rounded-xl border border-brand-teal px-4 py-2.5 text-sm font-medium text-brand-teal transition active:scale-[0.98]"
          >
            Agendar sem disparos
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
          >
            + Nova locação
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl sm:grid-cols-4">
        <div>
          <p className="text-xs text-neutral-500">WhatsApp</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.whatsapp ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">E-mail</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.email ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Cidade</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.city ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Endereço</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.address ?? "-"}</p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-xs text-neutral-500">Indicação</p>
          <p className="mt-0.5 text-sm text-neutral-900">
            {indicador ? (
              <>
                Indicado por{" "}
                <Link href={`/clientes/${indicador.id}`} className="text-brand-teal underline underline-offset-2">
                  {indicador.name}
                </Link>
              </>
            ) : (
              "Sem indicação registrada"
            )}
            {indicados.length > 0 && (
              <>
                {" · "}Indicou {indicados.length} {indicados.length === 1 ? "cliente" : "clientes"}:{" "}
                {indicados.map((i, idx) => (
                  <span key={i.id}>
                    {idx > 0 && ", "}
                    <Link href={`/clientes/${i.id}`} className="text-brand-teal underline underline-offset-2">
                      {i.name}
                    </Link>
                  </span>
                ))}
              </>
            )}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <p className="text-xs text-neutral-500">Observação</p>
          <p className="mt-0.5 text-sm text-neutral-900">{client.notes ?? "-"}</p>
        </div>

        {(client.whatsapp || client.address) && (
          <div className="col-span-2 flex gap-2 border-t border-neutral-100 pt-3 sm:col-span-4">
            {buildWhatsAppLink(client.whatsapp) && (
              <button
                type="button"
                onClick={() => openInNewTab(buildWhatsAppLink(client.whatsapp)!)}
                className="flex-1 rounded-lg bg-brand-teal/10 py-2 text-center text-xs font-medium text-brand-teal"
              >
                Abrir WhatsApp
              </button>
            )}
            {buildMapsLink(client.address) && (
              <button
                type="button"
                onClick={() => openInNewTab(buildMapsLink(client.address)!)}
                className="flex-1 rounded-lg bg-brand-blue/10 py-2 text-center text-xs font-medium text-brand-blue"
              >
                Abrir no Maps
              </button>
            )}
            {buildWazeLink(client.address) && (
              <button
                type="button"
                onClick={() => openInNewTab(buildWazeLink(client.address)!)}
                className="flex-1 rounded-lg bg-brand-lilac/10 py-2 text-center text-xs font-medium text-brand-lilac"
              >
                Abrir no Waze
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Total de locações</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{totalLocacoes}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Total faturado</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(totalFaturado)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Ticket médio</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">{formatCurrency(ticketMedio)}</p>
        </div>
        <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl">
          <p className="text-xs text-neutral-500">Última locação</p>
          <p className="mt-1 text-lg font-semibold text-neutral-900">
            {ultimaLocacao ? formatDate(ultimaLocacao) : "-"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-brand-teal/10 px-3 py-1 font-medium text-brand-teal">
          ✓ {concluidas} concluída{concluidas === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-brand-pink/10 px-3 py-1 font-medium text-brand-pink">
          ✕ {canceladas} cancelada{canceladas === 1 ? "" : "s"}
        </span>
        <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-medium text-brand-blue">
          ↻ {reagendadas} reagendada{reagendadas === 1 ? "" : "s"}
        </span>
        {/* A taxa de cada data aparece na lista de Agendamentos, abaixo,
            com os botões para mexer nela. Aqui em cima fica só o que é do
            cliente: se ele é parceiro e por isso nunca paga. */}
        {client.parceiro && (
          <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-medium text-brand-blue">
            🤝 Parceiro · reserva sem taxa
          </span>
        )}
        {!client.parceiro && client.isento_taxa && (
          <span className="rounded-full bg-brand-blue/10 px-3 py-1 font-medium text-brand-blue">
            Isenta de taxa de reserva
          </span>
        )}
      </div>

      {preReservas.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-700">Próximos agendamentos</h2>
          <p className="-mt-1 text-xs text-neutral-400">
            Ainda sem disparos contados. O contrato já pode ser gerado agora, antes do procedimento.
          </p>

          {/* Celular: cartões empilhados */}
          <div className="space-y-2 sm:hidden">
            {preReservas.map((pr) => (
              <div
                key={pr.id}
                className="rounded-xl border border-dashed border-brand-teal/40 bg-white/70 p-3 shadow-sm backdrop-blur-xl"
              >
                <p className="text-sm font-medium text-neutral-900">
                  {pr.equipments?.name ?? "-"}
                </p>
                <p className="mt-0.5 text-xs text-neutral-500">{formatPeriodo(pr)}</p>
                <Atalhos className="mt-2">
                  <Atalho href={linkEvento(pr.id)} emoji="📅">Agenda</Atalho>
                  {pr.equipment_id && !somenteLeitura && (
                    <Atalho href={linkNovoPlanejamento(client.id, pr.id)} emoji="📋">Planejamento</Atalho>
                  )}
                </Atalhos>
                {pr.taxa_status === "pendente" && (
                  <div className="mt-2">
                    <TaxaRecebidaBotao eventId={pr.id} />
                  </div>
                )}
                {podeCobrarTaxa(pr) && (
                  <CobrarTaxaBotao eventId={pr.id} onFeito={() => router.refresh()} className="mt-2 w-full" />
                )}
                <button
                  type="button"
                  onClick={() => setContratoOrigem({ kind: "reserva", reserva: pr })}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal"
                >
                  <FileText size={13} strokeWidth={1.75} />
                  Gerar contrato
                </button>
              </div>
            ))}
          </div>

          {/* Tablet e notebook: tabela */}
          <div className="hidden overflow-x-auto rounded-2xl border border-dashed border-brand-teal/40 bg-white/70 shadow-sm backdrop-blur-xl sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">HIPRO</th>
                  <th className="px-4 py-3 text-right">Contrato</th>
                </tr>
              </thead>
              <tbody>
                {preReservas.map((pr) => (
                  <tr key={pr.id} className="border-b border-neutral-100 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                      {formatPeriodo(pr)}
                    </td>
                    <td className="px-4 py-3 text-neutral-900">
                      {pr.equipments?.name ?? "-"}
                      <Atalhos className="mt-1">
                        <Atalho href={linkEvento(pr.id)} emoji="📅">Agenda</Atalho>
                        {pr.equipment_id && !somenteLeitura && (
                          <Atalho href={linkNovoPlanejamento(client.id, pr.id)} emoji="📋">Planejamento</Atalho>
                        )}
                      </Atalhos>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {pr.taxa_status === "pendente" && (
                        <div className="mb-2 min-w-[12rem] text-left">
                          <TaxaRecebidaBotao eventId={pr.id} />
                        </div>
                      )}
                      {podeCobrarTaxa(pr) && (
                        <CobrarTaxaBotao eventId={pr.id} onFeito={() => router.refresh()} className="mb-2 mr-2" />
                      )}
                      <button
                        type="button"
                        onClick={() => setContratoOrigem({ kind: "reserva", reserva: pr })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal"
                      >
                        <FileText size={13} strokeWidth={1.75} />
                        Gerar contrato
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Celular: cartões empilhados */}
      <div className="space-y-2 sm:hidden">
        {rentals.map((r) => (
          <div
            key={r.id}
            onClick={() => setEditingRental(r)}
            className="cursor-pointer rounded-xl border border-white/60 bg-white/70 p-3 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-neutral-900">{r.equipments?.name ?? "-"}</p>
                <p className="mt-0.5 text-xs text-neutral-500">
                  {formatPeriodo(r)} · {r.shots.toLocaleString("pt-BR")} disparos
                </p>
              </div>
              <span
                className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  r.status === "cancelada"
                    ? "bg-brand-pink/10 text-brand-pink"
                    : situacaoDe(r) === "realizada"
                      ? "bg-brand-teal/10 text-brand-teal"
                      : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {situacaoDe(r).replace("_", " ")}
                {r.rescheduled && " · ↻"}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs text-neutral-500">
                {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                {r.eventId && <Atalho href={linkEvento(r.eventId)} emoji="📅">Agenda</Atalho>}
              </span>
              <span className="font-medium text-brand-teal">{formatCurrency(Number(r.calculated_value))}</span>
            </div>
            {temSaldo(r) && (
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <p className="mb-1 text-[11px] text-amber-700">
                  {(r.totalPago ?? 0) > 0 ? `Já recebido ${formatCurrency(r.totalPago ?? 0)}. ` : ""}
                  Falta {formatCurrency(Number(r.saldo))}.
                </p>
                <ReceberPagamentoBotao rentalId={r.id} saldo={Number(r.saldo)} />
              </div>
            )}
            {r.status !== "cancelada" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setContratoOrigem({ kind: "rental", rental: r });
                }}
                className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-200 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal"
              >
                <FileText size={13} strokeWidth={1.75} />
                Gerar contrato
              </button>
            )}
          </div>
        ))}
        {rentals.length === 0 && (
          <div className="rounded-xl border border-dashed border-neutral-300/70 bg-white/50 py-8 text-center text-neutral-400 backdrop-blur-xl">
            Nenhuma locação registrada ainda.
          </div>
        )}
      </div>

      {/* Tablet e notebook: tabela completa */}
      <div className="hidden overflow-x-auto rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">HIPRO</th>
              <th className="px-4 py-3">Disparos</th>
              <th className="px-4 py-3 text-right">Valor</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Receber</th>
              <th className="px-4 py-3">Contrato</th>
            </tr>
          </thead>
          <tbody>
            {rentals.map((r) => (
              <tr
                key={r.id}
                onClick={() => setEditingRental(r)}
                className="cursor-pointer border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
              >
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {formatPeriodo(r)}
                  {r.eventId && (
                    <span className="ml-2">
                      <Atalho href={linkEvento(r.eventId)} emoji="📅" title="Atendimento na agenda">Agenda</Atalho>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-neutral-900">{r.equipments?.name ?? "-"}</td>
                <td className="px-4 py-3 text-neutral-600">{r.shots.toLocaleString("pt-BR")}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-brand-teal">
                  {formatCurrency(Number(r.calculated_value))}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-neutral-600">
                  {PAYMENT_LABELS[r.payment_method] ?? r.payment_method}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      r.status === "cancelada"
                        ? "bg-brand-pink/10 text-brand-pink"
                        : situacaoDe(r) === "realizada"
                          ? "bg-brand-teal/10 text-brand-teal"
                          : "bg-neutral-100 text-neutral-500"
                    }`}
                  >
                    {situacaoDe(r).replace("_", " ")}
                    {r.rescheduled && " · ↻"}
                  </span>
                </td>
                <td className="min-w-[10rem] px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  {temSaldo(r) && <ReceberPagamentoBotao rentalId={r.id} saldo={Number(r.saldo)} />}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.status !== "cancelada" && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContratoOrigem({ kind: "rental", rental: r });
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-600 hover:border-brand-teal hover:text-brand-teal"
                    >
                      <FileText size={13} strokeWidth={1.75} />
                      Gerar
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rentals.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                  Nenhuma locação registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <CreditosClienteCard clientId={client.id} />

      <AcessoPlanejadorCard cliente={client} onCadastroAtualizado={() => router.refresh()} />

      <HistoricoClienteSection clientId={client.id} />

      {modalOpen && (
        <CalculadoraLocacaoModal
          mode={{
            kind: "create",
            clientId: client.id,
            clientName: client.name,
            clientWhatsapp: client.whatsapp,
            clientParceiro: client.parceiro || client.isento_taxa,
            equipments,
          }}
          pricingConfig={pricingConfig}
          reservationFee={reservationFee}
          onClose={() => setModalOpen(false)}
          onDone={handleCreated}
        />
      )}

      {reservaOpen && (
        <ReservarHiproModal
          clients={[]}
          equipments={equipments}
          fixedClientId={client.id}
          fixedClientName={client.name}
          onClose={() => setReservaOpen(false)}
          onCreated={handleCreated}
        />
      )}

      {editClientOpen && (
        <EditarClienteModal
          client={client}
          onClose={() => setEditClientOpen(false)}
          onSaved={() => {
            setEditClientOpen(false);
            router.refresh();
          }}
          onDeleted={() => {
            // O registro deixou de existir: router.refresh() quebraria
            // esta página (ela busca este cliente no servidor). Sai pra
            // lista em vez de tentar recarregar aqui.
            router.push("/clientes");
          }}
        />
      )}

      {editingRental && (
        <EditarLocacaoModal
          rental={editingRental}
          equipments={equipments}
          pricingConfig={pricingConfig}
          currentClientId={client.id}
          currentClientName={client.name}
          onClose={() => setEditingRental(null)}
          onPaymentsChanged={() => router.refresh()}
          onSaved={() => {
            setEditingRental(null);
            router.refresh();
          }}
        />
      )}

      {contratoOrigem && (
        <GerarContratoModal
          origem={contratoOrigem}
          client={client}
          pricingConfig={pricingConfig}
          onClose={() => setContratoOrigem(null)}
        />
      )}
    </div>
  );
}
