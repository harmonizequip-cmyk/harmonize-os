"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { LinkCliente } from "@/components/Atalhos";
import { linkNovoPlanejamento, linkEvento } from "@/lib/atalhos";
import { agruparPorCliente, diasAte, retornosProximos, type PlanejamentoLinha } from "@/lib/planejamento";
import { formatDate } from "@/lib/format";
import { CalendarClock, ClipboardList, History, Pencil, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import ConfirmarApagarModal from "@/components/ConfirmarApagarModal";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { createClient } from "@/lib/supabase/client";
import HistoricoPaciente from "@/components/planejador/HistoricoPaciente";
import { normalizarNome, planosDoPaciente, saldoParaProximaSessao } from "@/lib/historico-paciente";

/** Linha da lista + o que sai do estado sem baixar ele todo (quantas sessões tem e em qual está). */
export type LinhaLista = PlanejamentoLinha & { sessoes_total?: number; sessao_atual?: number };

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

function quando(dias: number) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

function Linha({ p, hoje, mostrarCliente, portal, onHistorico }: { p: LinhaLista; hoje: string; mostrarCliente?: boolean; portal?: boolean; onHistorico: (p: LinhaLista) => void }) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const [apagar, setApagar] = useState(false);
  const base = portal ? "/portal" : "/planejador";
  const passou = p.saldo_total > 0 && p.total_disparos > p.saldo_total;
  const retorno = p.data_retorno ? diasAte(p.data_retorno, hoje) : null;
  const varias = (p.sessoes_total ?? 1) > 1;
  const saldoProxima = saldoParaProximaSessao(p);
  return (
    <>
    <Link href={`${base}/${p.id}`} className="block rounded-xl border border-neutral-200 bg-white px-3 py-2.5 hover:border-brand-teal/40">
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
      {varias || saldoProxima > 0 || (retorno !== null && retorno >= 0) || (!portal && (p.calendar_event_id || p.pela_cliente)) ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {varias && (
            <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] font-semibold text-brand-teal-dark">
              Sessão {p.sessao_atual ?? 1} de {p.sessoes_total}
            </span>
          )}
          {saldoProxima > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Saldo p/ próxima: {fmt(saldoProxima)}</span>
          )}
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
      <div className="mt-2 flex flex-wrap gap-2 border-t border-neutral-100 pt-2">
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHistorico(p);
          }}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-teal/10 px-4 text-xs font-semibold text-brand-teal-dark active:bg-brand-teal/20"
        >
          <History size={14} /> Histórico
        </span>
        {!somenteLeitura && (
          <>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                router.push(`${base}/${p.id}?aba=paciente`);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-neutral-100 px-4 text-xs font-semibold text-neutral-700"
            >
              <Pencil size={14} /> Editar
            </span>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setApagar(true);
              }}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-rose-50 px-4 text-xs font-semibold text-rose-600"
            >
              <Trash2 size={14} /> Excluir
            </span>
          </>
        )}
      </div>
    </Link>
    {apagar && (
      <ConfirmarApagarModal
        titulo={`Excluir ${p.paciente || "este paciente"}?`}
        descricao="Apaga o planejamento deste paciente, com as áreas e os disparos."
        onCancelar={() => setApagar(false)}
        onConfirmar={async () => {
          const { error } = await createClient().rpc("excluir_planejamento", { p_id: p.id });
          if (error) return error.message || "Não consegui apagar. Confira a internet.";
          setApagar(false);
          router.refresh();
        }}
      />
    )}
    </>
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
  planejamentos: LinhaLista[];
  clientes: ClientOption[];
  clienteInicial: string;
  hoje: string;
  erro: string | null;
}) {
  const [cliente, setCliente] = useState(clienteInicial);
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [procedimento, setProcedimento] = useState("");
  const [comSaldo, setComSaldo] = useState(false);
  const [comRetorno, setComRetorno] = useState(false);
  const [historico, setHistorico] = useState<LinhaLista | null>(null);

  const procedimentos = useMemo(
    () => Array.from(new Set(planejamentos.map((p) => (p.procedimento ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [planejamentos]
  );
  const nFiltros = [de, ate, procedimento.trim(), comSaldo, comRetorno].filter(Boolean).length;
  const algumFiltro = nFiltros > 0 || !!busca.trim();

  const filtrados = useMemo(() => {
    const t = normalizarNome(busca);
    const proc = normalizarNome(procedimento);
    return planejamentos.filter((p) => {
      if (cliente && p.client_id !== cliente) return false;
      if (t && ![p.paciente, p.procedimento, p.cliente_nome].some((v) => normalizarNome(v).includes(t))) return false;
      if (de && (!p.data || p.data.slice(0, 10) < de)) return false;
      if (ate && (!p.data || p.data.slice(0, 10) > ate)) return false;
      if (proc && !normalizarNome(p.procedimento).includes(proc)) return false;
      if (comSaldo && saldoParaProximaSessao(p) <= 0) return false;
      if (comRetorno && !(p.data_retorno && diasAte(p.data_retorno, hoje) >= 0)) return false;
      return true;
    });
  }, [planejamentos, cliente, busca, de, ate, procedimento, comSaldo, comRetorno, hoje]);

  function limparFiltros() {
    setBusca("");
    setDe("");
    setAte("");
    setProcedimento("");
    setComSaldo(false);
    setComRetorno(false);
  }

  const doHistorico = useMemo(() => (historico ? planosDoPaciente(planejamentos, historico) : []), [historico, planejamentos]);
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
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar paciente ou procedimento"
              className="min-h-10 w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltros((f) => !f)}
            aria-expanded={filtros}
            className={`inline-flex min-h-10 flex-shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold ring-1 ${nFiltros > 0 || filtros ? "bg-brand-teal/10 text-brand-teal-dark ring-brand-teal/40" : "bg-white text-neutral-700 ring-neutral-300"}`}
          >
            <SlidersHorizontal size={15} /> Filtros{nFiltros > 0 ? ` (${nFiltros})` : ""}
          </button>
        </div>
        {filtros && (
          <div className="space-y-2 rounded-xl bg-neutral-50 p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Atendimento de</span>
                <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-sm" />
              </label>
              <label className="block min-w-0">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">até</span>
                <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-sm" />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Procedimento</span>
              <input
                value={procedimento}
                onChange={(e) => setProcedimento(e.target.value)}
                list="procedimentos-existentes"
                placeholder="Ex.: Full Face"
                className="min-h-10 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-sm"
              />
              <datalist id="procedimentos-existentes">
                {procedimentos.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setComSaldo((v) => !v)}
                aria-pressed={comSaldo}
                className={`min-h-10 rounded-full px-4 text-xs font-semibold ring-1 ${comSaldo ? "bg-emerald-600 text-white ring-emerald-600" : "bg-white text-neutral-700 ring-neutral-300"}`}
              >
                Com saldo para próxima sessão
              </button>
              <button
                type="button"
                onClick={() => setComRetorno((v) => !v)}
                aria-pressed={comRetorno}
                className={`min-h-10 rounded-full px-4 text-xs font-semibold ring-1 ${comRetorno ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-neutral-700 ring-neutral-300"}`}
              >
                Retorno marcado
              </button>
            </div>
          </div>
        )}
        {algumFiltro && (
          <button
            type="button"
            onClick={limparFiltros}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-100 px-3 text-sm font-semibold text-neutral-700 active:bg-neutral-200"
          >
            <X size={14} /> Limpar filtros ({filtrados.length} de {planejamentos.length})
          </button>
        )}
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
              <Linha key={p.id} p={p} hoje={hoje} mostrarCliente={!portal} portal={portal} onHistorico={setHistorico} />
            ))}
          </div>
        </div>
      )}

      {grupos.length === 0 && !erro && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
          <p className="text-3xl">📋</p>
          <p className="mt-2 text-sm font-medium text-neutral-800">
            {algumFiltro && planejamentos.length > 0 ? "Nenhum planejamento com esses filtros" : `Nenhum planejamento ${cliente ? "desta cliente" : "ainda"}`}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {algumFiltro && planejamentos.length > 0
              ? "Toque em Limpar filtros para ver todos."
              : portal
                ? 'Toque em "Novo" para montar o primeiro.'
                : 'Toque em "Novo" ou abra pelo atendimento na Agenda.'}
          </p>
        </div>
      )}

      {portal &&
        filtrados.map((p) => <Linha key={p.id} p={p} hoje={hoje} portal onHistorico={setHistorico} />)}

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
            <Linha key={p.id} p={p} hoje={hoje} onHistorico={setHistorico} />
          ))}
        </section>
      ))}

      <HistoricoPaciente
        aberto={!!historico}
        onFechar={() => setHistorico(null)}
        planoIds={doHistorico.map((p) => p.id)}
        paciente={historico?.paciente ?? ""}
        cliente={portal ? null : historico?.cliente_nome}
        base={portal ? "/portal" : "/planejador"}
        hoje={hoje}
      />
    </div>
  );
}
