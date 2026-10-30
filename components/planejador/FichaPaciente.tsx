"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  CalendarClock,
  ChevronRight,
  Combine,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink, formatDate } from "@/lib/format";
import { linkNovoPlanejamento } from "@/lib/atalhos";
import { confirmar, avisar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { montarLinhaDoTempo, resumirHistorico, type EntradaHistorico } from "@/lib/historico-paciente";
import { idade, situacaoDoPlano, type PacienteResumo, type PlanoDoPaciente } from "@/lib/pacientes";
import { saldoParaProximaSessao } from "@/lib/historico-paciente";
import SeloSituacao from "@/components/planejador/SeloSituacao";
import ConfirmarApagarModal from "@/components/ConfirmarApagarModal";
import FotosPaciente from "@/components/planejador/FotosPaciente";
import { areasCorporaisDosPlanos } from "@/lib/fotos-paciente";

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

/** Endereço do planejamento novo já com o paciente (e a cliente, fora do portal). */
export function linkNovoDoPaciente(r: { pacienteId: string | null; client_id: string | null }, portal?: boolean): string {
  const base = portal ? "/portal/novo" : linkNovoPlanejamento(r.client_id);
  if (!r.pacienteId) return base;
  return `${base}${base.includes("?") ? "&" : "?"}paciente=${r.pacienteId}`;
}

/**
 * Ficha do paciente: o saldo que falta usar (com "Continuar"), os números,
 * os dados do cadastro e todas as sessões de todos os planejamentos dele, da
 * mais recente para a mais antiga. O estado dos planejamentos é buscado ao
 * abrir (a lista só tem as colunas leves).
 */
export default function FichaPaciente({
  paciente,
  outros,
  portal,
  temCadastro,
  hoje,
  onFechar,
  onMudou,
}: {
  paciente: PacienteResumo<PlanoDoPaciente> | null;
  /** Outros pacientes da mesma cliente (para juntar cadastros repetidos). */
  outros: PacienteResumo<PlanoDoPaciente>[];
  portal?: boolean;
  /** O SQL dos pacientes já rodou (dá para editar e juntar). */
  temCadastro: boolean;
  hoje: string;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const somenteLeitura = useSomenteLeitura();
  const base = portal ? "/portal" : "/planejador";
  const [montado, setMontado] = useState(false);
  const [entradas, setEntradas] = useState<EntradaHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selecionando, setSelecionando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [form, setForm] = useState({ nome: "", whatsapp: "", nascimento: "", observacoes: "" });
  const [salvando, setSalvando] = useState(false);
  const [juntarCom, setJuntarCom] = useState("");
  const aberto = !!paciente;
  const planoIds = paciente?.planos.map((p) => p.id) ?? [];
  const chave = planoIds.join(",");

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    setEditando(false);
    setSelecionando(false);
    setSelecionados(new Set());
    setConfirmarApagar(false);
    setJuntarCom("");
  }, [paciente?.chave]);

  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", tecla);
      html.style.overflow = antes;
    };
  }, [aberto, onFechar]);

  useEffect(() => {
    if (!aberto) return;
    if (planoIds.length === 0) {
      setEntradas([]);
      return;
    }
    let ativo = true;
    setEntradas(null);
    setErro(null);
    createClient()
      .from("planejamentos")
      .select("id, estado, data, data_retorno, procedimento, saldo_total, total_disparos, updated_at")
      .in("id", planoIds)
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          setErro("Não consegui carregar as sessões. Confira a internet e tente de novo.");
          return;
        }
        setEntradas((data ?? []) as EntradaHistorico[]);
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto, chave]);

  const resumo = useMemo(() => (entradas ? resumirHistorico(entradas) : null), [entradas]);
  const tempo = useMemo(() => (entradas ? montarLinhaDoTempo(entradas) : []), [entradas]);
  // Só as áreas corporais separam as fotos (o facial fica todo em "Rosto").
  const areasCorporais = useMemo(() => (entradas ? areasCorporaisDosPlanos(entradas.map((e) => e.estado)) : []), [entradas]);
  const paraJuntar = outros.filter((o) => o.pacienteId && o.pacienteId !== paciente?.pacienteId);

  if (!montado || !paciente) return null;
  const cad = paciente.cadastro;
  const podeEditar = temCadastro && !!paciente.pacienteId && !somenteLeitura;
  const anos = idade(cad?.nascimento, hoje);
  const whats = cad?.whatsapp ? buildWhatsAppLink(cad.whatsapp) : null;
  const entrada = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm";
  const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500";

  function abrirEdicao() {
    setForm({
      nome: cad?.nome ?? paciente!.nome,
      whatsapp: cad?.whatsapp ?? "",
      nascimento: cad?.nascimento ?? "",
      observacoes: cad?.observacoes ?? "",
    });
    setEditando(true);
  }

  async function salvarDados() {
    if (!form.nome.trim()) return avisar("Escreva o nome do paciente.", "erro");
    setSalvando(true);
    const { error } = await createClient().rpc("salvar_paciente", {
      p_id: paciente!.pacienteId,
      p_client_id: paciente!.client_id,
      p_nome: form.nome,
      p_whatsapp: form.whatsapp || null,
      p_nascimento: form.nascimento || null,
      p_observacoes: form.observacoes || null,
    });
    setSalvando(false);
    if (error) return avisar(error.message || "Não consegui salvar. Confira a internet.", "erro");
    setEditando(false);
    avisar("Ficha do paciente salva.");
    onMudou();
  }

  async function juntar() {
    const outro = paraJuntar.find((o) => o.pacienteId === juntarCom);
    if (!outro) return;
    const ok = await confirmar({
      titulo: `Juntar "${outro.nome}" em "${paciente!.nome}"?`,
      texto: `As sessões de ${outro.nome} passam para ${paciente!.nome} e o cadastro repetido some. Use quando for a mesma pessoa escrita de dois jeitos.`,
      confirmar: "Juntar",
    });
    if (!ok) return;
    const { error } = await createClient().rpc("juntar_pacientes", { p_manter: paciente!.pacienteId, p_juntar: outro.pacienteId });
    if (error) return avisar(error.message || "Não consegui juntar. Confira a internet.", "erro");
    avisar("Pacientes juntados.");
    onFechar();
    onMudou();
  }

  async function excluirCadastro() {
    const ok = await confirmar({ titulo: `Excluir o cadastro de ${paciente!.nome}?`, texto: "Ele não tem nenhum planejamento.", confirmar: "Excluir", perigo: true });
    if (!ok) return;
    const { error } = await createClient().rpc("excluir_paciente", { p_id: paciente!.pacienteId });
    if (error) return avisar(error.message || "Não consegui excluir. Confira a internet.", "erro");
    onFechar();
    onMudou();
  }

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#F3F6F7]" role="dialog" aria-label={`Ficha de ${paciente.nome || "paciente"}`}>
      <header className="bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(16,24,40,.06)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-teal/10 text-base font-black text-brand-teal-dark">
            {paciente.nome ? paciente.nome.trim()[0]?.toUpperCase() : <UserRound size={20} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-neutral-900">{paciente.nome || "Paciente sem nome"}</p>
            <p className="truncate text-xs text-neutral-500">
              Ficha do paciente{!portal && paciente.cliente_nome ? ` · ${paciente.cliente_nome}` : ""}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-3 px-4 pb-24 pt-4">
          {/* Saldo a usar: o mais importante, sempre no topo. */}
          {paciente.saldos.length > 0 && (
            <section className="rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                <Sparkles size={13} /> Saldo de disparos para usar
              </p>
              <div className="space-y-2">
                {paciente.saldos.map((s) => (
                  <div key={s.plano.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-amber-100">
                    <div className="min-w-0">
                      <p className="text-lg font-black tabular-nums text-amber-700">{fmt(s.saldo)} disparos</p>
                      <p className="truncate text-xs text-neutral-600">
                        Para a Sessão {s.proximaSessao} de {s.sessoes}
                        {s.plano.procedimento ? ` · ${s.plano.procedimento}` : ""}
                        {s.plano.data_retorno ? ` · retorno ${formatDate(s.plano.data_retorno)}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`${base}/${s.plano.id}`}
                      className="inline-flex min-h-10 flex-shrink-0 items-center gap-1 rounded-full bg-amber-500 px-4 text-xs font-bold text-white active:bg-amber-600"
                    >
                      Continuar <ChevronRight size={14} />
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200/80">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Sessões</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-neutral-900">{resumo ? resumo.sessoes : "-"}</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200/80">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Disparos</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-brand-teal-dark">{resumo ? fmt(resumo.usados) : "-"}</p>
            </div>
            <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200/80">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Saldo</p>
              <p className={`mt-0.5 text-xl font-black tabular-nums ${resumo && resumo.saldoRestante > 0 ? "text-amber-700" : "text-neutral-900"}`}>
                {resumo ? fmt(resumo.saldoRestante) : "-"}
              </p>
            </div>
          </div>

          {!somenteLeitura && (
            <Link
              href={linkNovoDoPaciente(paciente, portal)}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand-gradient px-4 text-sm font-bold text-white"
            >
              <Plus size={16} /> Novo planejamento para {paciente.nome ? paciente.nome.split(" ")[0] : "este paciente"}
            </Link>
          )}

          {/* Dados do cadastro. */}
          {paciente.pacienteId && (
            <section className="rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Dados do paciente</p>
                {podeEditar && !editando && (
                  <button onClick={abrirEdicao} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-700 active:bg-neutral-200">
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </div>
              {editando ? (
                <div className="space-y-2.5">
                  <label className="block">
                    <span className={rotulo}>Nome</span>
                    <input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className={entrada} autoComplete="off" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block min-w-0">
                      <span className={rotulo}>WhatsApp</span>
                      <input value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} inputMode="tel" placeholder="(83) 9..." className={entrada} />
                    </label>
                    <label className="block min-w-0">
                      <span className={rotulo}>Nascimento</span>
                      <input type="date" value={form.nascimento} onChange={(e) => setForm({ ...form, nascimento: e.target.value })} className={entrada} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={rotulo}>Observações (alergias, cuidados)</span>
                    <textarea value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} rows={3} className={entrada} />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setEditando(false)} className="min-h-11 flex-1 rounded-xl bg-neutral-100 text-sm font-semibold text-neutral-700">
                      Cancelar
                    </button>
                    <button onClick={salvarDados} disabled={salvando} className="min-h-11 flex-1 rounded-xl bg-brand-teal text-sm font-bold text-white disabled:opacity-60">
                      {salvando ? "Salvando..." : "Salvar"}
                    </button>
                  </div>
                </div>
              ) : (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-neutral-500">WhatsApp</dt>
                    <dd className="font-medium text-neutral-800">
                      {cad?.whatsapp ? (
                        whats ? (
                          <a href={whats} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-700">
                            <MessageCircle size={14} /> {cad.whatsapp}
                          </a>
                        ) : (
                          cad.whatsapp
                        )
                      ) : (
                        <span className="text-neutral-400">não informado</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-neutral-500">Nascimento</dt>
                    <dd className="font-medium text-neutral-800">
                      {cad?.nascimento ? `${formatDate(cad.nascimento)}${anos !== null ? ` (${anos} anos)` : ""}` : <span className="text-neutral-400">não informado</span>}
                    </dd>
                  </div>
                  {cad?.observacoes && <p className="whitespace-pre-wrap rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{cad.observacoes}</p>}
                </dl>
              )}
            </section>
          )}

          {/* Fotos (só o dono; dado sensível, pede autorização do paciente). */}
          {!portal && paciente.pacienteId && !somenteLeitura && (
            <FotosPaciente
              key={paciente.pacienteId}
              pacienteId={paciente.pacienteId}
              nomePaciente={paciente.nome}
              autorizadoEm={cad?.fotos_autorizadas_em ?? null}
              planos={paciente.planos.map((p) => ({ id: p.id, data: p.data, procedimento: p.procedimento }))}
              areas={areasCorporais}
              onMudou={onMudou}
            />
          )}

          {/* Planejamentos (cada um com as suas sessões). */}
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                Planejamentos ({paciente.planos.length})
              </p>
              {!somenteLeitura && paciente.planos.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelecionando((v) => !v);
                    setSelecionados(new Set());
                  }}
                  className="min-h-9 rounded-full bg-neutral-100 px-3 text-xs font-semibold text-neutral-700 active:bg-neutral-200"
                >
                  {selecionando ? "Cancelar" : "Selecionar para apagar"}
                </button>
              )}
            </div>
            {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
            {paciente.planos.length === 0 && (
              <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">Este paciente ainda não tem planejamentos.</p>
            )}
            {paciente.planos.map((pl) => {
                const sessoes = tempo.filter((s) => s.planoId === pl.id).sort((x, y) => x.n - y.n);
                const situacao = situacaoDoPlano(pl);
                const saldo = saldoParaProximaSessao(pl);
                const marcado = selecionados.has(pl.id);
                const alternar = () =>
                  setSelecionados((atual) => {
                    const novo = new Set(atual);
                    if (novo.has(pl.id)) novo.delete(pl.id);
                    else novo.add(pl.id);
                    return novo;
                  });
                return (
                  <article
                    key={pl.id}
                    className={`relative overflow-hidden rounded-2xl bg-white ${marcado ? "ring-2 ring-rose-400" : situacao === "pendente" ? "ring-1 ring-amber-300" : "ring-1 ring-neutral-200/80"}`}
                  >
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${situacao === "pendente" ? "bg-amber-400" : "bg-emerald-400"}`} aria-hidden />
                    <div
                      className={`flex items-start gap-3 py-3 pl-4 pr-3 ${selecionando ? "cursor-pointer" : ""}`}
                      onClick={selecionando ? alternar : undefined}
                    >
                      {selecionando && (
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={alternar}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Selecionar o planejamento de ${pl.data ? formatDate(pl.data) : "sem data"}`}
                          className="mt-1 h-5 w-5 flex-shrink-0 accent-rose-600"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-neutral-900">HIPRO Day {pl.data ? formatDate(pl.data) : "sem data"}</p>
                        <p className="truncate text-xs text-neutral-500">
                          {pl.procedimento || "Sem procedimento"} · {fmt(pl.total_disparos)}
                          {pl.saldo_total ? ` de ${fmt(pl.saldo_total)}` : ""} disparos
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <SeloSituacao situacao={situacao} detalhe={saldo > 0 ? `${fmt(saldo)} disparos p/ Sessão ${(pl.sessao_atual ?? 1) + 1}` : undefined} />
                        </div>
                      </div>
                    </div>
                    {!selecionando && (
                      <div className="space-y-2 border-t border-neutral-100 px-4 pb-3 pt-2">
                        {!entradas && !erro && (
                          <p className="flex items-center gap-2 py-1 text-xs text-neutral-500">
                            <Loader2 size={13} className="animate-spin" /> Carregando as sessões...
                          </p>
                        )}
                        {sessoes.map((s) => (
                          <div key={s.n} className="rounded-xl bg-neutral-50 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-neutral-800">
                                Sessão {s.n} de {s.sessoes}
                                {s.data ? ` · ${formatDate(s.data)}` : ""}
                                {s.aberta && s.sessoes > 1 ? " · em andamento" : ""}
                              </p>
                              <p className="font-mono text-xs font-semibold text-brand-teal-dark">{fmt(s.total)}</p>
                            </div>
                            {s.areas.length > 0 ? (
                              <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-500">{s.areas.map((a) => `${a.nome} ${fmt(a.total)}`).join(" · ")}</p>
                            ) : (
                              <p className="mt-0.5 text-[11px] text-neutral-400">Nenhuma área com disparos.</p>
                            )}
                            {s.retorno && s.aberta && (
                              <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-neutral-600">
                                <CalendarClock size={11} /> Retorno {formatDate(s.retorno)}
                              </p>
                            )}
                          </div>
                        ))}
                        <Link
                          href={`${base}/${pl.id}`}
                          className={`inline-flex min-h-10 items-center gap-1 rounded-full px-4 text-xs font-semibold ${situacao === "pendente" ? "bg-amber-500 text-white" : "bg-neutral-100 text-neutral-700"}`}
                        >
                          {situacao === "pendente" ? "Continuar" : "Abrir planejamento"} <ChevronRight size={14} />
                        </Link>
                      </div>
                    )}
                  </article>
                );
              })}
          </section>

          {/* Cadastro repetido ou sem uso. */}
          {podeEditar && (paraJuntar.length > 0 || paciente.planos.length === 0) && (
            <details className="group rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80" open={paciente.planos.length === 0}>
              <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between text-sm font-semibold text-neutral-700">
                Mais opções <ChevronRight size={16} className="transition group-open:rotate-90" />
              </summary>
              <div className="mt-2 space-y-2">
              {paraJuntar.length > 0 && (
                <>
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-neutral-800">
                    <Combine size={15} /> Mesmo paciente com outro nome?
                  </p>
                  <p className="text-xs text-neutral-500">Escolha o cadastro repetido para trazer as sessões dele para esta ficha.</p>
                  <div className="flex gap-2">
                    <select value={juntarCom} onChange={(e) => setJuntarCom(e.target.value)} className={`${entrada} min-w-0 flex-1`}>
                      <option value="">Escolha o paciente</option>
                      {paraJuntar.map((o) => (
                        <option key={o.pacienteId!} value={o.pacienteId!}>
                          {o.nome} ({o.planos.length} {o.planos.length === 1 ? "planejamento" : "planejamentos"})
                        </option>
                      ))}
                    </select>
                    <button onClick={juntar} disabled={!juntarCom} className="min-h-10 flex-shrink-0 rounded-lg bg-neutral-800 px-4 text-sm font-semibold text-white disabled:opacity-40">
                      Juntar
                    </button>
                  </div>
                </>
              )}
              {paciente.planos.length === 0 && (
                <button onClick={excluirCadastro} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-rose-50 px-4 text-xs font-semibold text-rose-600">
                  <Trash2 size={14} /> Excluir cadastro
                </button>
              )}
              </div>
            </details>
          )}
        </div>
      </div>
      {selecionando && (
        <div className="border-t border-neutral-200 bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
          <div className="mx-auto flex max-w-3xl items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-neutral-600">
              {selecionados.size ? `${selecionados.size} ${selecionados.size === 1 ? "planejamento escolhido" : "planejamentos escolhidos"}` : "Toque nos planejamentos que quer apagar"}
            </p>
            <button
              type="button"
              disabled={!selecionados.size}
              onClick={() => setConfirmarApagar(true)}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white disabled:opacity-40"
            >
              <Trash2 size={16} /> Apagar
            </button>
          </div>
        </div>
      )}
      {confirmarApagar && (
        <ConfirmarApagarModal
          titulo={`Apagar ${selecionados.size} ${selecionados.size === 1 ? "planejamento" : "planejamentos"} de ${paciente.nome || "este paciente"}?`}
          descricao="Apaga só os planejamentos escolhidos, com as áreas, os disparos e as sessões deles. Os outros ficam."
          onCancelar={() => setConfirmarApagar(false)}
          onConfirmar={async () => {
            const sb = createClient();
            for (const id of selecionados) {
              const { error } = await sb.rpc("excluir_planejamento", { p_id: id });
              if (error) {
                onMudou();
                return error.message || "Não consegui apagar. Confira a internet.";
              }
            }
            const apagouTodos = selecionados.size >= paciente.planos.length;
            avisar(selecionados.size === 1 ? "Planejamento apagado." : `${selecionados.size} planejamentos apagados.`);
            setConfirmarApagar(false);
            setSelecionando(false);
            setSelecionados(new Set());
            if (apagouTodos && !paciente.pacienteId) onFechar();
            onMudou();
          }}
        />
      )}
    </div>,
    document.body
  );
}
