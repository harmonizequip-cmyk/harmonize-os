"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClientOption } from "@/components/ClientPicker";
import { LinkCliente } from "@/components/Atalhos";
import { linkNovoPlanejamento } from "@/lib/atalhos";
import { diasAte, type PlanejamentoLinha } from "@/lib/planejamento";
import { formatDate } from "@/lib/format";
import { ArrowLeft, CalendarClock, CalendarDays, CircleCheck, ChevronRight, ClipboardList, Clock3, Plus, Search, UserRound, Users, X } from "lucide-react";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import FichaPaciente from "@/components/planejador/FichaPaciente";
import SeloSituacao from "@/components/planejador/SeloSituacao";
import { normalizarNome } from "@/lib/historico-paciente";
import { createClient } from "@/lib/supabase/client";
import { formatarTamanho } from "@/lib/fotos-paciente";
import {
  agruparPacientesPorCliente,
  agruparPorPaciente,
  diasDeHipro,
  pacienteBate,
  pacientesDoDia,
  situacaoDoPaciente,
  type ClienteDoPlanejador,
  type PacienteCadastro,
  type PacienteResumo,
  type Situacao,
} from "@/lib/pacientes";

/** Linha da lista + o que sai do estado sem baixar ele todo (quantas sessões tem e em qual está). */
export type LinhaLista = PlanejamentoLinha & { sessoes_total?: number; sessao_atual?: number };
type Paciente = PacienteResumo<LinhaLista>;

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");
const SEM_CLIENTE = "sem";

function diaCurto(d: string) {
  const [a, m, dd] = d.split("-");
  const sem = new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" }).replace(".", "");
  return { dia: `${dd}/${m}`, ano: a, semana: sem };
}

function CartaoCliente({ g, onAbrir }: { g: ClienteDoPlanejador<LinhaLista>; onAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`w-full rounded-2xl bg-white p-4 text-left ring-1 transition active:scale-[.99] ${g.pendentes > 0 ? "ring-amber-300" : "ring-neutral-200"}`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-teal/10 text-base font-black text-brand-teal-dark">
          {g.clientId ? g.nome.replace(/^(dra?\.?\s+)/i, "").trim()[0]?.toUpperCase() : <Users size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-bold text-neutral-900">{g.nome}</p>
          <p className="text-xs text-neutral-500">
            {g.pacientes.length} {g.pacientes.length === 1 ? "paciente" : "pacientes"}
            {g.ultimoDia ? ` · último HIPRO Day ${formatDate(g.ultimoDia)}` : ""}
          </p>
        </div>
        <ChevronRight size={20} className="flex-shrink-0 text-neutral-300" />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5 pl-14">
        {g.pendentes > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
            <Clock3 size={12} /> {g.pendentes} {g.pendentes === 1 ? "pendente" : "pendentes"}
          </span>
        )}
        {g.concluidos > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-800">
            <CircleCheck size={12} /> {g.concluidos} {g.concluidos === 1 ? "concluído" : "concluídos"}
          </span>
        )}
      </div>
    </button>
  );
}

function CartaoPaciente({ r, hoje, portal, mostrarCliente, onAbrir }: { r: Paciente; hoje: string; portal?: boolean; mostrarCliente?: boolean; onAbrir: () => void }) {
  const situacao = situacaoDoPaciente(r);
  const saldo = r.saldos[0];
  const diasRetorno = r.retorno ? diasAte(r.retorno, hoje) : null;
  return (
    <button
      type="button"
      onClick={onAbrir}
      className={`relative w-full overflow-hidden rounded-2xl bg-white py-3 pl-4 pr-3 text-left ring-1 transition active:scale-[.99] ${situacao === "pendente" ? "ring-amber-300" : "ring-neutral-200"}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${situacao === "pendente" ? "bg-amber-400" : "bg-emerald-400"}`} aria-hidden />
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[15px] font-bold ${r.nome ? "text-neutral-900" : "italic text-neutral-400"}`}>{r.nome || "Paciente sem nome"}</p>
          <p className="truncate text-xs text-neutral-500">
            {r.ultimaData ? `HIPRO Day ${formatDate(r.ultimaData)}` : "Sem data"}
            {r.ultimoProcedimento ? ` · ${r.ultimoProcedimento}` : ""}
            {` · ${r.sessoes} ${r.sessoes === 1 ? "sessão" : "sessões"}`}
          </p>
          {mostrarCliente && r.cliente_nome && <p className="truncate text-xs text-neutral-400">{r.cliente_nome}</p>}
        </div>
        <ChevronRight size={18} className="mt-1 flex-shrink-0 text-neutral-300" />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <SeloSituacao situacao={situacao} detalhe={saldo ? `${fmt(r.saldoTotal)} disparos p/ Sessão ${saldo.proximaSessao}` : undefined} />
        {diasRetorno !== null && diasRetorno >= 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700">
            <CalendarClock size={12} /> Retorno {formatDate(r.retorno!)}
          </span>
        )}
        {r.planos.length > 1 && <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-600">{r.planos.length} planejamentos</span>}
        {!portal && r.pelaCliente && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">Feito pela cliente</span>}
      </div>
    </button>
  );
}

/** Pílulas de filtro (uma escolhida). */
function Pilulas<T extends string>({ valor, opcoes, onMudar }: { valor: T; opcoes: { v: T; rotulo: string }[]; onMudar: (v: T) => void }) {
  return (
    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl bg-neutral-100 p-1">
      {opcoes.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onMudar(o.v)}
          aria-pressed={valor === o.v}
          className={`min-h-9 rounded-lg px-2 text-xs font-semibold ${valor === o.v ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export default function PlanejadorLista({
  planejamentos,
  pacientes = [],
  temCadastro = false,
  clientes,
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
  /** Guardados por compatibilidade: a cliente e o paciente abertos vêm do endereço (?cliente=, ?paciente=). */
  clienteInicial?: string;
  pacienteInicial?: string;
  hoje: string;
  erro: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const somenteLeitura = useSomenteLeitura();
  const clienteAberto = portal ? "" : params.get("cliente") ?? "";
  const pacienteDoEndereco = params.get("paciente") ?? "";
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<"" | Situacao>("");
  const [diaHipro, setDiaHipro] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [usoFotos, setUsoFotos] = useState<number | null>(null);

  // Espaço usado pelas fotos dos pacientes (antes do SQL das fotos, não mostra nada).
  useEffect(() => {
    if (portal) return;
    let ativo = true;
    createClient()
      .rpc("uso_fotos_pacientes")
      .then(({ data, error }) => {
        if (!ativo || error) return;
        const r = (Array.isArray(data) ? data[0] : data) as { fotos?: number; bytes?: number } | null;
        if (r && r.bytes !== undefined && r.bytes !== null) setUsoFotos(Number(r.bytes) || 0);
      });
    return () => {
      ativo = false;
    };
  }, [portal]);

  const todos = useMemo(() => agruparPorPaciente(planejamentos, pacientes, hoje), [planejamentos, pacientes, hoje]);
  const nomeDaCliente = (id: string | null, sugestao: string | null) => sugestao || clientes.find((c) => c.id === id)?.name || (id ? "Cliente" : "Sem cliente");
  const grupos = useMemo(() => agruparPacientesPorCliente(todos, nomeDaCliente), [todos, clientes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trocou de cliente: os filtros de dentro voltam ao começo.
  useEffect(() => {
    setBusca("");
    setSituacao("");
    setDiaHipro("");
  }, [clienteAberto]);

  // ?paciente=<id>: abre a ficha dele.
  useEffect(() => {
    if (!pacienteDoEndereco) return;
    const r = todos.find((x) => x.pacienteId === pacienteDoEndereco);
    if (r) setAberta(r.chave);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pacienteDoEndereco]);

  const grupoAberto = portal
    ? { clientId: null, nome: nomePortal || "Meus pacientes", pacientes: todos, pendentes: 0, concluidos: 0, ultimoDia: null }
    : clienteAberto
      ? grupos.find((g) => (g.clientId ?? SEM_CLIENTE) === clienteAberto) ?? {
          clientId: clienteAberto === SEM_CLIENTE ? null : clienteAberto,
          nome: nomeDaCliente(clienteAberto === SEM_CLIENTE ? null : clienteAberto, null),
          pacientes: [],
          pendentes: 0,
          concluidos: 0,
          ultimoDia: null,
        }
      : null;

  const fichaAberta = todos.find((r) => r.chave === aberta) ?? null;
  const outrosDaCliente = useMemo(
    () => (fichaAberta ? todos.filter((r) => r.client_id === fichaAberta.client_id && r.chave !== fichaAberta.chave) : []),
    [todos, fichaAberta]
  );
  const ficha = (
    <FichaPaciente
      paciente={fichaAberta}
      outros={outrosDaCliente}
      portal={portal}
      temCadastro={temCadastro}
      hoje={hoje}
      onFechar={() => setAberta(null)}
      onMudou={() => router.refresh()}
    />
  );
  const abrirCliente = (g: ClienteDoPlanejador<LinhaLista>) => router.push(`/planejador?cliente=${g.clientId ?? SEM_CLIENTE}`);

  /* ---------------- Dentro de uma cliente (e o portal) ---------------- */
  if (grupoAberto) {
    const dias = diasDeHipro(grupoAberto.pacientes);
    const doDia = pacientesDoDia(grupoAberto.pacientes, diaHipro);
    const nPend = doDia.filter((r) => situacaoDoPaciente(r) === "pendente").length;
    const visiveis = doDia
      .filter((r) => !situacao || situacaoDoPaciente(r) === situacao)
      .filter((r) => pacienteBate(r, busca))
      .sort((a, b) => (situacaoDoPaciente(a) === "pendente" ? 0 : 1) - (situacaoDoPaciente(b) === "pendente" ? 0 : 1));
    const linkNovo = portal ? "/portal/novo" : linkNovoPlanejamento(grupoAberto.clientId);
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-28">
        {!portal && (
          <button type="button" onClick={() => router.push("/planejador")} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-brand-teal-dark">
            <ArrowLeft size={16} /> Todas as clientes
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-neutral-900">{portal ? "Meus pacientes" : grupoAberto.nome}</h1>
            <p className="text-sm text-neutral-500">
              {grupoAberto.pacientes.length} {grupoAberto.pacientes.length === 1 ? "paciente" : "pacientes"}. Toque no paciente para ver a ficha.
            </p>
            {!portal && grupoAberto.clientId && (
              <LinkCliente id={grupoAberto.clientId} className="text-xs text-brand-teal-dark">
                Abrir a ficha da cliente
              </LinkCliente>
            )}
          </div>
          {!somenteLeitura && (
            <Link href={linkNovo} className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white">
              <Plus size={16} /> Novo
            </Link>
          )}
        </div>

        {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

        {grupoAberto.pacientes.length > 0 && (
          <div className="space-y-3 rounded-2xl bg-white p-3 ring-1 ring-neutral-200">
            {dias.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                  <CalendarDays size={13} /> HIPRO Day
                </p>
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1">
                  <button
                    type="button"
                    onClick={() => setDiaHipro("")}
                    aria-pressed={!diaHipro}
                    className={`min-h-12 flex-shrink-0 rounded-xl px-4 text-sm font-semibold ring-1 ${!diaHipro ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-700 ring-neutral-300"}`}
                  >
                    Todos
                  </button>
                  {dias.map((d) => {
                    const c = diaCurto(d);
                    const ativo = diaHipro === d;
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDiaHipro(ativo ? "" : d)}
                        aria-pressed={ativo}
                        className={`flex min-h-12 flex-shrink-0 flex-col items-center justify-center rounded-xl px-3 leading-tight ring-1 ${ativo ? "bg-brand-teal text-white ring-brand-teal" : "bg-white text-neutral-800 ring-neutral-300"}`}
                      >
                        <span className="text-sm font-bold">{c.dia}</span>
                        <span className={`text-[10px] ${ativo ? "text-white/80" : "text-neutral-500"}`}>
                          {c.semana} {c.ano !== hoje.slice(0, 4) ? c.ano : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Pilulas
              valor={situacao}
              onMudar={setSituacao}
              opcoes={[
                { v: "", rotulo: `Todos (${doDia.length})` },
                { v: "pendente", rotulo: `Pendentes (${nPend})` },
                { v: "concluido", rotulo: `Concluídos (${doDia.length - nPend})` },
              ]}
            />
            {grupoAberto.pacientes.length > 6 && (
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar paciente" className="min-h-10 w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm" />
              </div>
            )}
          </div>
        )}

        {visiveis.length === 0 && !erro && (
          <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
            <ClipboardList size={28} className="mx-auto text-neutral-300" />
            <p className="mt-2 text-sm font-medium text-neutral-800">
              {grupoAberto.pacientes.length ? "Nenhum paciente com esses filtros" : "Nenhum paciente ainda"}
            </p>
            {grupoAberto.pacientes.length > 0 && (
              <button type="button" onClick={() => (setDiaHipro(""), setSituacao(""), setBusca(""))} className="mt-2 text-sm font-semibold text-brand-teal-dark">
                Mostrar todos
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {visiveis.map((r) => (
            <CartaoPaciente key={r.chave} r={r} hoje={hoje} portal={portal} onAbrir={() => setAberta(r.chave)} />
          ))}
        </div>
        {ficha}
      </div>
    );
  }

  /* ---------------- Início: um cartão por cliente ---------------- */
  const t = normalizarNome(busca);
  const pacientesAchados = t ? todos.filter((r) => normalizarNome(r.nome).includes(t)) : [];
  const gruposVisiveis = grupos.filter((g) => !t || normalizarNome(g.nome).includes(t) || g.pacientes.some((r) => normalizarNome(r.nome).includes(t)));
  const totalPend = grupos.reduce((s, g) => s + g.pendentes, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-neutral-900">
            <ClipboardList size={20} className="text-brand-teal" /> Planejador HIPRO
          </h1>
          <p className="text-sm text-neutral-500">
            {grupos.length} {grupos.length === 1 ? "cliente" : "clientes"} · {todos.length} {todos.length === 1 ? "paciente" : "pacientes"}
          </p>
          {usoFotos !== null && <p className="text-[11px] text-neutral-400">Fotos: {formatarTamanho(usoFotos)} de 1 GB do plano gratuito</p>}
        </div>
        {!somenteLeitura && (
          <Link href={linkNovoPlanejamento(null)} className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white">
            <Plus size={16} /> Novo
          </Link>
        )}
      </div>

      {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente ou paciente"
          className="min-h-11 w-full rounded-xl border border-neutral-300 bg-white py-2 pl-9 pr-9 text-sm"
        />
        {busca && (
          <button type="button" onClick={() => setBusca("")} aria-label="Limpar busca" className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-neutral-400">
            <X size={16} />
          </button>
        )}
      </div>

      {!t && totalPend > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
          <Clock3 size={16} /> {totalPend} {totalPend === 1 ? "paciente ainda tem" : "pacientes ainda têm"} disparos para usar
        </p>
      )}

      {pacientesAchados.length > 0 && (
        <section className="space-y-2">
          <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Pacientes encontrados</p>
          {pacientesAchados.slice(0, 20).map((r) => (
            <CartaoPaciente key={r.chave} r={r} hoje={hoje} mostrarCliente onAbrir={() => setAberta(r.chave)} />
          ))}
        </section>
      )}

      {gruposVisiveis.length === 0 && !erro && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
          <UserRound size={28} className="mx-auto text-neutral-300" />
          <p className="mt-2 text-sm font-medium text-neutral-800">{t ? "Nada encontrado" : "Nenhum planejamento ainda"}</p>
          {!t && <p className="mt-1 text-sm text-neutral-500">Toque em &quot;Novo&quot; ou abra pelo atendimento na Agenda.</p>}
        </div>
      )}

      <section className="space-y-2">
        {t && gruposVisiveis.length > 0 && <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Clientes</p>}
        {gruposVisiveis.map((g) => (
          <CartaoCliente key={g.clientId ?? SEM_CLIENTE} g={g} onAbrir={() => abrirCliente(g)} />
        ))}
      </section>
      {ficha}
    </div>
  );
}
