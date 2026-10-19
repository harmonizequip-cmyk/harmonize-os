"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarClock, ChevronRight, Loader2, Search, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import {
  filtrarSessoes,
  montarLinhaDoTempo,
  resumirHistorico,
  type EntradaHistorico,
} from "@/lib/historico-paciente";

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");


/**
 * Histórico do paciente: linha do tempo com cada sessão (data, procedimento, disparos,
 * áreas tratadas, saldo que ficou para a próxima e retorno), com busca e período.
 * Busca o estado dos planejamentos do paciente sob demanda (a lista só tem colunas leves).
 */
export default function HistoricoPaciente({
  aberto,
  onFechar,
  planoIds,
  paciente,
  cliente,
  base,
  hoje,
}: {
  aberto: boolean;
  onFechar: () => void;
  planoIds: string[];
  paciente: string;
  cliente?: string | null;
  /** "/planejador" ou "/portal". */
  base: string;
  hoje: string;
}) {
  const [montado, setMontado] = useState(false);
  const [entradas, setEntradas] = useState<EntradaHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const chave = planoIds.join(",");

  useEffect(() => setMontado(true), []);

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
    if (!aberto || planoIds.length === 0) return;
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
          setErro("Não consegui carregar o histórico. Confira a internet e tente de novo.");
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

  if (!montado || !aberto) return null;
  const entrada = "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm";

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#F3F6F7]" role="dialog" aria-label={`Histórico de ${paciente}`}>
      <header className="bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(16,24,40,.06)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-teal/10 text-brand-teal-dark">
            <UserRound size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-neutral-900">{paciente || "Paciente sem nome"}</p>
            <p className="truncate text-xs text-neutral-500">Histórico do paciente{cliente ? ` · ${cliente}` : ""}</p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600 active:bg-neutral-200">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-3 px-4 pb-24 pt-4">
          {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
          {!entradas && !erro && (
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-neutral-500">
              <Loader2 size={16} className="animate-spin" /> Carregando o histórico...
            </p>
          )}

          {resumo && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200/80">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Sessões</p>
                  <p className="mt-0.5 text-xl font-black tabular-nums text-neutral-900">{resumo.sessoes}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200/80">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Disparos</p>
                  <p className="mt-0.5 text-xl font-black tabular-nums text-brand-teal-dark">{fmt(resumo.usados)}</p>
                </div>
                <div className="rounded-2xl bg-white px-3 py-3 ring-1 ring-neutral-200/80">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Saldo</p>
                  <p className="mt-0.5 text-xl font-black tabular-nums text-neutral-900">{fmt(resumo.saldoRestante)}</p>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl bg-white p-3 ring-1 ring-neutral-200/80">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                  <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por área ou procedimento" className={`${entrada} pl-9`} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">De</span>
                    <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={entrada} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Até</span>
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

              {visiveis.length === 0 && (
                <p className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
                  {filtrando ? "Nenhuma sessão com esse filtro." : "Este paciente ainda não tem sessões."}
                </p>
              )}

              <ol className="space-y-3">
                {visiveis.map((s) => {
                  const diasRetorno = s.retorno ? Math.round((Date.parse(`${s.retorno}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000) : null;
                  return (
                    <li key={`${s.planoId}-${s.n}`} className="rounded-2xl bg-white p-4 ring-1 ring-neutral-200/80">
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
                        {s.sessoes > 1 && (
                          <span className="rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] font-semibold text-brand-teal-dark">
                            Sessão {s.n} de {s.sessoes}
                          </span>
                        )}
                        {s.aberta && s.sessoes > 1 && <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">Aberta</span>}
                        {s.saldoParaProxima > 0 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Saldo p/ próxima: {fmt(s.saldoParaProxima)}</span>
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
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
