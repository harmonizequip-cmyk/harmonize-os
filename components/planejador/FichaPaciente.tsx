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
import { filtrarSessoes, montarLinhaDoTempo, resumirHistorico, type EntradaHistorico } from "@/lib/historico-paciente";
import { idade, type PacienteResumo, type PlanoDoPaciente } from "@/lib/pacientes";

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
  const [texto, setTexto] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
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
    setTexto("");
    setDe("");
    setAte("");
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
  const visiveis = useMemo(() => filtrarSessoes(tempo, { de, ate, texto }), [tempo, de, ate, texto]);
  const filtrando = !!(texto || de || ate);
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
            <section className="rounded-2xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                <Sparkles size={13} /> Saldo de disparos para usar
              </p>
              <div className="space-y-2">
                {paciente.saldos.map((s) => (
                  <div key={s.plano.id} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-emerald-100">
                    <div className="min-w-0">
                      <p className="text-lg font-black tabular-nums text-emerald-700">{fmt(s.saldo)} disparos</p>
                      <p className="truncate text-xs text-neutral-600">
                        Para a Sessão {s.proximaSessao} de {s.sessoes}
                        {s.plano.procedimento ? ` · ${s.plano.procedimento}` : ""}
                        {s.plano.data_retorno ? ` · retorno ${formatDate(s.plano.data_retorno)}` : ""}
                      </p>
                    </div>
                    <Link
                      href={`${base}/${s.plano.id}`}
                      className="inline-flex min-h-10 flex-shrink-0 items-center gap-1 rounded-full bg-emerald-600 px-4 text-xs font-bold text-white active:bg-emerald-700"
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
              <p className={`mt-0.5 text-xl font-black tabular-nums ${resumo && resumo.saldoRestante > 0 ? "text-emerald-700" : "text-neutral-900"}`}>
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

          {/* Sessões. */}
          <section className="space-y-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Todas as sessões</p>
            {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
            {!entradas && !erro && (
              <p className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
                <Loader2 size={16} className="animate-spin" /> Carregando as sessões...
              </p>
            )}
            {tempo.length > 2 && (
              <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por área ou procedimento" className={`${entrada} pl-9`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={rotulo}>De</span>
                    <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={entrada} />
                  </label>
                  <label className="block">
                    <span className={rotulo}>Até</span>
                    <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={entrada} />
                  </label>
                </div>
                {filtrando && (
                  <button
                    type="button"
                    onClick={() => (setTexto(""), setDe(""), setAte(""))}
                    className="min-h-10 w-full rounded-lg bg-neutral-100 px-3 text-sm font-semibold text-neutral-700 active:bg-neutral-200"
                  >
                    Limpar filtros ({visiveis.length} de {tempo.length})
                  </button>
                )}
              </div>
            )}
            {entradas && visiveis.length === 0 && (
              <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
                {filtrando ? "Nenhuma sessão com esse filtro." : "Este paciente ainda não tem sessões."}
              </p>
            )}
            <ol className="space-y-3">
              {visiveis.map((s) => {
                const diasRetorno = s.retorno ? Math.round((Date.parse(`${s.retorno}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000) : null;
                const comSaldo = s.saldoParaProxima > 0;
                return (
                  <li key={`${s.planoId}-${s.n}`} className={`rounded-2xl bg-white p-4 ${comSaldo ? "ring-2 ring-emerald-300" : "ring-1 ring-neutral-200/80"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-neutral-900">{s.data ? formatDate(s.data) : "Sem data"}</p>
                        <p className="truncate text-xs text-neutral-500">{s.procedimento || "Sem procedimento"}</p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="font-mono text-sm font-semibold text-brand-teal-dark">{fmt(s.total)}</p>
                        <p className="text-[10px] text-neutral-400">disparos</p>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] font-semibold text-brand-teal-dark">
                        Sessão {s.n} de {s.sessoes}
                      </span>
                      {s.aberta && s.sessoes > 1 && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">Em andamento</span>}
                      {comSaldo && (
                        <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">Saldo p/ próxima: {fmt(s.saldoParaProxima)}</span>
                      )}
                      {s.retorno && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          <CalendarClock size={11} />
                          {s.aberta ? "Retorno" : "Próxima sessão"} {formatDate(s.retorno)}
                          {s.aberta && diasRetorno !== null && diasRetorno >= 0 ? (diasRetorno === 0 ? " (hoje)" : ` (em ${diasRetorno} d)`) : ""}
                        </span>
                      )}
                    </div>
                    {s.areas.length > 0 ? (
                      <ul className="mt-3 divide-y divide-neutral-100 rounded-xl bg-neutral-50 px-3 text-sm">
                        {s.areas.map((a) => (
                          <li key={a.nome} className="flex items-center justify-between gap-2 py-2">
                            <span className="min-w-0 truncate text-neutral-700">{a.nome}</span>
                            <span className="flex-shrink-0 font-mono text-xs font-semibold text-neutral-800">{fmt(a.total)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-3 rounded-xl bg-neutral-50 px-3 py-2 text-xs text-neutral-500">Nenhuma área com disparos nesta sessão.</p>
                    )}
                    <Link
                      href={`${base}/${s.planoId}`}
                      className="mt-3 inline-flex min-h-10 items-center gap-1 rounded-full bg-neutral-100 px-4 text-xs font-semibold text-neutral-700 active:bg-neutral-200"
                    >
                      Abrir planejamento <ChevronRight size={14} />
                    </Link>
                  </li>
                );
              })}
            </ol>
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
    </div>,
    document.body
  );
}
