"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { LinkCliente } from "@/components/Atalhos";
import { linkNovoPlanejamento } from "@/lib/atalhos";
import { diasAte, type PlanejamentoLinha } from "@/lib/planejamento";
import { formatDate } from "@/lib/format";
import { CalendarClock, ChevronRight, ClipboardList, History, Pencil, Plus, Search, SlidersHorizontal, UserRound, X } from "lucide-react";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { usePreferencias } from "@/lib/usar-preferencias";
import FichaPaciente, { linkNovoDoPaciente } from "@/components/planejador/FichaPaciente";
import { normalizarNome } from "@/lib/historico-paciente";
import { agruparPorPaciente, pacienteBate, type PacienteCadastro, type PacienteResumo } from "@/lib/pacientes";

/** Linha da lista + o que sai do estado sem baixar ele todo (quantas sessões tem e em qual está). */
export type LinhaLista = PlanejamentoLinha & { sessoes_total?: number; sessao_atual?: number };

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

function quando(dias: number) {
  if (dias === 0) return "hoje";
  if (dias === 1) return "amanhã";
  return `em ${dias} dias`;
}

function CartaoPaciente({
  r,
  hoje,
  portal,
  mostrarCliente,
  onAbrir,
}: {
  r: PacienteResumo<LinhaLista>;
  hoje: string;
  portal?: boolean;
  mostrarCliente?: boolean;
  onAbrir: (r: PacienteResumo<LinhaLista>) => void;
}) {
  const somenteLeitura = useSomenteLeitura();
  const base = portal ? "/portal" : "/planejador";
  const continuar = r.saldos[0]?.plano ?? r.planos[0] ?? null;
  const diasRetorno = r.retorno ? diasAte(r.retorno, hoje) : null;
  const pararClique = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onAbrir(r)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onAbrir(r))}
      className={`cursor-pointer rounded-2xl bg-white px-3 py-3 text-left ring-1 transition active:scale-[.99] ${r.saldoTotal > 0 ? "ring-emerald-300" : "ring-neutral-200 hover:ring-brand-teal/40"}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-teal/10 text-sm font-black text-brand-teal-dark">
          {r.nome ? r.nome.trim()[0]?.toUpperCase() : <UserRound size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-neutral-900">{r.nome || "Paciente sem nome"}</p>
          <p className="truncate text-xs text-neutral-500">
            {r.sessoes} {r.sessoes === 1 ? "sessão" : "sessões"}
            {r.ultimaData ? ` · último ${formatDate(r.ultimaData)}` : ""}
            {r.ultimoProcedimento ? ` · ${r.ultimoProcedimento}` : ""}
          </p>
          {mostrarCliente && r.cliente_nome && (
            <p className="truncate text-xs text-neutral-500" onClick={pararClique}>
              <LinkCliente id={r.client_id}>{r.cliente_nome}</LinkCliente>
            </p>
          )}
        </div>
        <ChevronRight size={18} className="mt-2 flex-shrink-0 text-neutral-300" />
      </div>

      {(r.saldoTotal > 0 || (diasRetorno !== null && diasRetorno >= 0) || r.planos.length > 1 || (!portal && r.pelaCliente)) && (
        <div className="mt-2 flex flex-wrap gap-1.5 pl-[52px]">
          {r.saldos.map((s) => (
            <span key={s.plano.id} className="rounded-full bg-emerald-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
              {fmt(s.saldo)} disparos p/ Sessão {s.proximaSessao}
            </span>
          ))}
          {diasRetorno !== null && diasRetorno >= 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <CalendarClock size={11} /> Retorno {quando(diasRetorno)} ({formatDate(r.retorno!)})
            </span>
          )}
          {r.planos.length > 1 && (
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">{r.planos.length} planejamentos</span>
          )}
          {!portal && r.pelaCliente && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">Feito pela cliente</span>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-2 border-t border-neutral-100 pt-2.5" onClick={pararClique}>
        <button
          type="button"
          onClick={() => onAbrir(r)}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-brand-teal/10 px-4 text-xs font-semibold text-brand-teal-dark active:bg-brand-teal/20"
        >
          <History size={14} /> Ficha
        </button>
        {continuar && (
          <Link
            href={`${base}/${continuar.id}`}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-xs font-semibold ${r.saldoTotal > 0 ? "bg-emerald-600 text-white" : "bg-neutral-100 text-neutral-700"}`}
          >
            <Pencil size={14} /> {r.saldoTotal > 0 ? "Continuar" : "Abrir último"}
          </Link>
        )}
        {!somenteLeitura && (
          <Link href={linkNovoDoPaciente(r, portal)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-neutral-100 px-4 text-xs font-semibold text-neutral-700">
            <Plus size={14} /> Novo
          </Link>
        )}
      </div>
    </div>
  );
}

export default function PlanejadorLista({
  planejamentos,
  pacientes = [],
  temCadastro = false,
  clientes,
  clienteInicial,
  pacienteInicial = "",
  hoje,
  erro,
  portal,
  nomeCliente: nomePortal,
}: {
  portal?: boolean;
  nomeCliente?: string | null;
  planejamentos: LinhaLista[];
  pacientes?: PacienteCadastro[];
  temCadastro?: boolean;
  clientes: ClientOption[];
  clienteInicial: string;
  /** ?paciente=<id>: abre a ficha dele ao entrar. */
  pacienteInicial?: string;
  hoje: string;
  erro: string | null;
}) {
  const router = useRouter();
  const [cliente, setCliente] = useState(clienteInicial);
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState(false);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [procedimento, setProcedimento] = useState("");
  const [comSaldo, setComSaldo] = useState(false);
  const [comRetorno, setComRetorno] = useState(false);
  const [aberta, setAberta] = useState<string | null>(null);

  const todos = useMemo(() => agruparPorPaciente(planejamentos, pacientes, hoje), [planejamentos, pacientes, hoje]);

  useEffect(() => {
    if (!pacienteInicial) return;
    const r = todos.find((x) => x.pacienteId === pacienteInicial);
    if (r) setAberta(r.chave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteInicial]);

  const procedimentos = useMemo(
    () => Array.from(new Set(planejamentos.map((p) => (p.procedimento ?? "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [planejamentos]
  );
  const nFiltros = [de, ate, procedimento.trim(), comSaldo, comRetorno].filter(Boolean).length;
  const algumFiltro = nFiltros > 0 || !!busca.trim();

  const filtrados = useMemo(() => {
    const proc = normalizarNome(procedimento);
    return todos.filter((r) => {
      if (cliente && r.client_id !== cliente) return false;
      if (!pacienteBate(r, busca)) return false;
      if ((de || ate) && !r.planos.some((p) => p.data && (!de || p.data.slice(0, 10) >= de) && (!ate || p.data.slice(0, 10) <= ate))) return false;
      if (proc && !r.planos.some((p) => normalizarNome(p.procedimento).includes(proc))) return false;
      if (comSaldo && r.saldoTotal <= 0) return false;
      if (comRetorno && !r.retorno) return false;
      return true;
    });
  }, [todos, cliente, busca, de, ate, procedimento, comSaldo, comRetorno]);

  function limparFiltros() {
    setBusca("");
    setDe("");
    setAte("");
    setProcedimento("");
    setComSaldo(false);
    setComRetorno(false);
  }

  const retornoDias = usePreferencias().planejador.retornoDias;
  const retornos = useMemo(
    () =>
      filtrados
        .filter((r) => r.retorno && diasAte(r.retorno, hoje) <= retornoDias)
        .sort((a, b) => (a.retorno ?? "").localeCompare(b.retorno ?? "")),
    [filtrados, hoje, retornoDias]
  );
  const comSaldoTotal = useMemo(() => todos.filter((r) => (!cliente || r.client_id === cliente) && r.saldoTotal > 0).length, [todos, cliente]);
  const grupos = useMemo(() => {
    const m = new Map<string, { clientId: string | null; nome: string; itens: PacienteResumo<LinhaLista>[] }>();
    for (const r of filtrados) {
      const k = r.client_id ?? "";
      const nome = r.cliente_nome || clientes.find((c) => c.id === r.client_id)?.name || "Sem cliente";
      if (!m.has(k)) m.set(k, { clientId: r.client_id, nome, itens: [] });
      m.get(k)!.itens.push(r);
    }
    return Array.from(m.values()).sort((a, b) => (a.clientId ? 0 : 1) - (b.clientId ? 0 : 1) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [filtrados, clientes]);
  const fichaAberta = todos.find((r) => r.chave === aberta) ?? null;
  const outrosDaCliente = useMemo(
    () => (fichaAberta ? todos.filter((r) => r.client_id === fichaAberta.client_id && r.chave !== fichaAberta.chave) : []),
    [todos, fichaAberta]
  );
  const nomeCliente = clientes.find((c) => c.id === cliente)?.name;
  const linkNovo = portal ? "/portal/novo" : linkNovoPlanejamento(cliente || null);
  const abrir = (r: PacienteResumo<LinhaLista>) => setAberta(r.chave);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
            <ClipboardList size={20} className="text-brand-teal" /> {portal ? "Meus pacientes" : "Planejador HIPRO"}
          </h1>
          <p className="text-sm text-neutral-500">
            {todos.length} {todos.length === 1 ? "paciente" : "pacientes"}
            {portal ? (nomePortal ? ` de ${nomePortal}` : "") : ", por cliente."} Toque no paciente para ver a ficha.
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
        {comSaldoTotal > 0 && !comSaldo && (
          <button
            type="button"
            onClick={() => setComSaldo(true)}
            className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 text-left text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200 active:bg-emerald-100"
          >
            <span>
              {comSaldoTotal} {comSaldoTotal === 1 ? "paciente com saldo" : "pacientes com saldo"} para a próxima sessão
            </span>
            <ChevronRight size={16} />
          </button>
        )}
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
            <X size={14} /> Limpar filtros ({filtrados.length} de {todos.length})
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

      {retornos.length > 0 && !comRetorno && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800">
            <CalendarClock size={14} /> Retornos nos próximos {retornoDias} dias
          </p>
          <div className="space-y-2">
            {retornos.map((r) => (
              <CartaoPaciente key={r.chave} r={r} hoje={hoje} portal={portal} mostrarCliente={!portal} onAbrir={abrir} />
            ))}
          </div>
        </div>
      )}

      {filtrados.length === 0 && !erro && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
          <ClipboardList size={28} className="mx-auto text-neutral-300" />
          <p className="mt-2 text-sm font-medium text-neutral-800">
            {algumFiltro && todos.length > 0 ? "Nenhum paciente com esses filtros" : `Nenhum paciente ${cliente ? "desta cliente" : "ainda"}`}
          </p>
          <p className="mt-1 text-sm text-neutral-500">
            {algumFiltro && todos.length > 0
              ? "Toque em Limpar filtros para ver todos."
              : portal
                ? 'Toque em "Novo" para montar o primeiro.'
                : 'Toque em "Novo" ou abra pelo atendimento na Agenda.'}
          </p>
        </div>
      )}

      {portal && <div className="space-y-2">{filtrados.map((r) => <CartaoPaciente key={r.chave} r={r} hoje={hoje} portal onAbrir={abrir} />)}</div>}

      {!portal &&
        grupos.map((g) => (
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
            {g.itens.map((r) => (
              <CartaoPaciente key={r.chave} r={r} hoje={hoje} onAbrir={abrir} />
            ))}
          </section>
        ))}

      <FichaPaciente
        paciente={fichaAberta}
        outros={outrosDaCliente}
        portal={portal}
        temCadastro={temCadastro}
        hoje={hoje}
        onFechar={() => setAberta(null)}
        onMudou={() => router.refresh()}
      />
    </div>
  );
}
