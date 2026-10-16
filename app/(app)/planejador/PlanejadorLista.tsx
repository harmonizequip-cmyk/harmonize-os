"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { LinkCliente } from "@/components/Atalhos";
import { linkNovoPlanejamento, linkEvento } from "@/lib/atalhos";
import { agruparPorCliente, diasAte, retornosProximos, type PlanejamentoLinha } from "@/lib/planejamento";
import { formatDate } from "@/lib/format";
import { CalendarClock, ClipboardList, Plus, Search } from "lucide-react";

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

function quando(dias: number) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

function Linha({ p, hoje, mostrarCliente, portal }: { p: PlanejamentoLinha; hoje: string; mostrarCliente?: boolean; portal?: boolean }) {
  const router = useRouter();
  const passou = p.saldo_total > 0 && p.total_disparos > p.saldo_total;
  const retorno = p.data_retorno ? diasAte(p.data_retorno, hoje) : null;
  return (
    <Link href={`${portal ? "/portal" : "/planejador"}/${p.id}`} className="block rounded-xl border border-neutral-200 bg-white px-3 py-2.5 hover:border-brand-teal/40">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-900">{p.paciente || "Paciente sem nome"}</p>
          <p className="truncate text-xs text-neutral-500">
            {p.data ? formatDate(p.data) : "sem data"}
            {p.procedimento ? ` · ${p.procedimento}` : ""}
            {mostrarCliente && p.cliente_nome ? (
              <>
                {" · "}
                <LinkCliente id={p.client_id}>{p.cliente_nome}</LinkCliente>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={`font-mono text-sm font-semibold ${passou ? "text-rose-600" : "text-brand-teal-dark"}`}>{fmt(p.total_disparos)}</p>
          <p className="text-[10px] text-neutral-400">{p.saldo_total ? `de ${fmt(p.saldo_total)}` : "disparos"}</p>
        </div>
      </div>
      {(retorno !== null && retorno >= 0) || (!portal && (p.calendar_event_id || p.pela_cliente)) ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {retorno !== null && retorno >= 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              Retorno {quando(retorno)} ({formatDate(p.data_retorno!)})
            </span>
          )}
          {!portal && p.pela_cliente && (
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Feito pela cliente</span>
          )}
          {!portal && p.calendar_event_id && (
            <span
              role="link"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(linkEvento(p.calendar_event_id!));
              }}
              className="rounded-full border border-brand-teal/30 bg-brand-teal/5 px-2 py-0.5 text-[11px] font-medium text-brand-teal-dark"
            >
              📅 Atendimento
            </span>
          )}
        </div>
      ) : null}
    </Link>
  );
}

export default function PlanejadorLista({
  planejamentos,
  clientes,
  clienteInicial,
  hoje,
  erro,
  portal,
  nomeCliente: nomePortal,
}: {
  portal?: boolean;
  nomeCliente?: string | null;
  planejamentos: PlanejamentoLinha[];
  clientes: ClientOption[];
  clienteInicial: string;
  hoje: string;
  erro: string | null;
}) {
  const [cliente, setCliente] = useState(clienteInicial);
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return planejamentos.filter(
      (p) =>
        (!cliente || p.client_id === cliente) &&
        (!t || [p.paciente, p.procedimento, p.cliente_nome].some((v) => (v ?? "").toLowerCase().includes(t)))
    );
  }, [planejamentos, cliente, busca]);
  const grupos = useMemo(() => agruparPorCliente(filtrados), [filtrados]);
  const retornos = useMemo(() => retornosProximos(filtrados, hoje), [filtrados, hoje]);
  const nomeCliente = clientes.find((c) => c.id === cliente)?.name;
  const linkNovo = portal ? "/portal/novo" : linkNovoPlanejamento(cliente || null);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
            <ClipboardList size={20} className="text-brand-teal" /> {portal ? "Meus planejamentos" : "Planejador HIPRO"}
          </h1>
          <p className="text-sm text-neutral-500">
            {planejamentos.length} {planejamentos.length === 1 ? "planejamento" : "planejamentos"}
            {portal ? (nomePortal ? ` de ${nomePortal}` : "") : ", por cliente e paciente."}
          </p>
        </div>
        <Link
          href={linkNovo}
          className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white"
        >
          <Plus size={16} /> Novo
        </Link>
      </div>

      {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

      <div className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-3">
        {!portal && (
          <ClientPicker
            clients={clientes}
            value={cliente}
            onChange={setCliente}
            onClientCreated={() => {}}
            label="Cliente"
            optional
            noneLabel="Todas as clientes"
            allowCreate={false}
          />
        )}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar paciente ou procedimento"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm"
          />
        </div>
        {cliente && !portal && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            <LinkCliente id={cliente} className="text-xs text-brand-teal-dark">
              Abrir a ficha de {nomeCliente ?? "a cliente"}
            </LinkCliente>
          </div>
        )}
      </div>

      {retornos.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <CalendarClock size={14} /> Retornos nos próximos 15 dias
          </p>
          <div className="space-y-2">
            {retornos.map((p) => (
              <Linha key={p.id} p={p} hoje={hoje} mostrarCliente={!portal} portal={portal} />
            ))}
          </div>
        </div>
      )}

      {grupos.length === 0 && !erro && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm font-medium text-neutral-800">Nenhum planejamento {cliente ? "desta cliente" : "ainda"}</p>
          <p className="mt-1 text-sm text-neutral-500">{portal ? 'Toque em "Novo" para montar o primeiro.' : 'Toque em "Novo" ou abra pelo atendimento na Agenda.'}</p>
        </div>
      )}

      {portal &&
        filtrados.map((p) => <Linha key={p.id} p={p} hoje={hoje} portal />)}

      {!portal && grupos.map((g) => (
        <section key={g.clientId ?? "sem"} className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <p className="text-sm font-semibold text-neutral-800">
              <LinkCliente id={g.clientId}>{g.nome}</LinkCliente>{" "}
              <span className="font-normal text-neutral-400">
                · {g.itens.length} {g.itens.length === 1 ? "paciente" : "pacientes"}
              </span>
            </p>
            {g.clientId && (
              <Link href={linkNovoPlanejamento(g.clientId)} className="text-xs font-medium text-brand-teal-dark">
                + Novo para ela
              </Link>
            )}
          </div>
          {g.itens.map((p) => (
            <Linha key={p.id} p={p} hoje={hoje} />
          ))}
        </section>
      ))}
    </div>
  );
}
