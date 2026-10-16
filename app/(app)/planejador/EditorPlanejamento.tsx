"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { CHAVE_PLANO_IA, linkCliente, linkEvento, linkNovoPlanejamento } from "@/lib/atalhos";
import { temConteudo, type EstadoPlanejador, type PlanejamentoMontado } from "@/lib/planejamento";
import {
  PERFIS,
  alertas,
  areasPreenchidas,
  linhaVazia,
  mascaraReais,
  normalizarPlano,
  paraEstado,
  situacaoSaldo,
  textoResumo,
  todasAreas,
  totalArea,
  totalDistribuido,
  type Area,
  type Linha,
  type Plano,
} from "@/lib/planejador";
import { htmlFichaPaciente, htmlProntuario, imprimir } from "@/lib/planejador-impressao";
import SeletorPlanejamento from "@/components/SeletorPlanejamento";
import { CartaoArea, Folha, FolhaModelo, FolhaNovaArea, fmt } from "@/components/planejador/Partes";
import ResumoPlano from "@/components/planejador/ResumoPlano";
import { formatDate } from "@/lib/format";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardCopy,
  Copy,
  FileText,
  ListChecks,
  Loader2,
  MoreHorizontal,
  Plus,
  Share2,
  Sparkles,
  Trash2,
  UserRound,
  CalendarDays,
} from "lucide-react";

type Cliente = ClientOption & { profissional: string };
type Evento = { id: string; date_start: string; event_type: string };
type Aba = "paciente" | "areas" | "resumo";

const EQUIP: Record<string, string> = { hipro_1: "HIPRO 1", hipro_2: "HIPRO 2" };

// Planejador HIPRO nativo, em tela cheia (cobre o menu do app): topo com
// paciente, cliente e saldo; abas Paciente, Áreas e Resumo. Guarda sozinho
// no banco (com intervalo); planejamento novo só vira registro quando ganha
// conteúdo. O estado salvo é o mesmo do planejador antigo.
export default function EditorPlanejamento({
  planoId,
  estado,
  clienteId,
  eventoId,
  clientes,
  portal,
}: {
  /** Login da cliente (/portal): sem escolha de cliente/atendimento, sem IA. */
  portal?: boolean;
  planoId: string | null;
  estado: EstadoPlanejador;
  clienteId: string | null;
  eventoId: string | null;
  clientes: Cliente[];
}) {
  const supabase = createClient();
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const base = portal ? "/portal" : "/planejador";
  const [id, setId] = useState<string | null>(planoId);
  const [cliente, setCliente] = useState(clienteId ?? "");
  const [evento, setEvento] = useState(eventoId ?? "");
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [status, setStatus] = useState<"" | "salvando" | "salvo" | "erro">(planoId ? "salvo" : "");
  const [plano, setPlano] = useState<Plano>(() => normalizarPlano(estado));
  const [aba, setAba] = useState<Aba>(() => (planoId && totalDistribuido(normalizarPlano(estado)) > 0 ? "areas" : "paciente"));
  const [abertas, setAbertas] = useState<Set<string>>(() => {
    const p = normalizarPlano(estado);
    return new Set(todasAreas(p).filter((a) => totalArea(p, a) > 0).map((a) => a.id));
  });
  const [soPreenchidas, setSoPreenchidas] = useState(false);
  const [modelo, setModelo] = useState<Area | null>(null);
  const [novaArea, setNovaArea] = useState(false);
  const [seletor, setSeletor] = useState(false);
  const [menu, setMenu] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [digitando, setDigitando] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(id);
  const planoRef = useRef(plano);
  const sujo = useRef(false);
  const ligacao = useRef({ cliente, evento });
  idRef.current = id;
  planoRef.current = plano;
  ligacao.current = { cliente, evento };

  // Tela cheia: a página de trás não rola.
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = antes;
    };
  }, []);

  // Teclado aberto: esconde a barra de baixo para não cobrir o campo.
  useEffect(() => {
    const ehCampo = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    const entrou = (e: FocusEvent) => ehCampo(e.target) && setDigitando(true);
    const saiu = (e: FocusEvent) => ehCampo(e.target) && setDigitando(false);
    document.addEventListener("focusin", entrou);
    document.addEventListener("focusout", saiu);
    return () => {
      document.removeEventListener("focusin", entrou);
      document.removeEventListener("focusout", saiu);
    };
  }, []);

  const mostrarAviso = useCallback((t: string) => {
    setAviso(t);
    setTimeout(() => setAviso((a) => (a === t ? null : a)), 2600);
  }, []);

  const salvar = useCallback(async () => {
    if (!sujo.current || somenteLeitura) return;
    const p = planoRef.current;
    const total = totalDistribuido(p);
    const est = paraEstado(p);
    if (!idRef.current && !temConteudo(est, total)) return;
    sujo.current = false;
    setStatus("salvando");
    const { data, error } = await supabase.rpc("salvar_planejamento", {
      p_id: idRef.current,
      p_client_id: ligacao.current.cliente || null,
      p_calendar_event_id: ligacao.current.evento || null,
      p_estado: est,
      p_total: total,
    });
    if (error) {
      sujo.current = true;
      setStatus("erro");
      return;
    }
    if (!idRef.current && data) {
      idRef.current = data as string;
      setId(data as string);
      window.history.replaceState(null, "", `${base}/${data}`);
    }
    setStatus("salvo");
  }, [supabase, somenteLeitura, base]);

  const agendar = useCallback(() => {
    sujo.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(salvar, 1000);
  }, [salvar]);

  const mudar = useCallback(
    (fn: (p: Plano) => Plano) => {
      if (somenteLeitura) return;
      setPlano((p) => {
        const novo = fn(p);
        planoRef.current = novo;
        return novo;
      });
      agendar();
    },
    [agendar, somenteLeitura]
  );

  const campo = <K extends keyof Plano>(k: K, v: Plano[K]) => mudar((p) => ({ ...p, [k]: v }));

  // Vindo do assistente ou do "Duplicar" (?ia=1): o plano montado entra por cima.
  useEffect(() => {
    try {
      if (!planoId && new URLSearchParams(window.location.search).get("ia") === "1") {
        const daIa = JSON.parse(sessionStorage.getItem(CHAVE_PLANO_IA) ?? "null") as EstadoPlanejador | null;
        sessionStorage.removeItem(CHAVE_PLANO_IA);
        if (daIa) {
          const novo = normalizarPlano({ ...estado, ...daIa, profissional: (daIa.profissional as string) || estado.profissional });
          setPlano(novo);
          planoRef.current = novo;
          setAbertas(new Set(todasAreas(novo).filter((a) => totalArea(novo, a) > 0).map((a) => a.id)));
          setAba("areas");
          agendar();
        }
      }
    } catch {
      // sessão indisponível: segue com o estado inicial
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ao sair da tela, guarda o que faltou.
  useEffect(() => {
    const sair = () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      salvar();
    };
    window.addEventListener("pagehide", sair);
    return () => {
      window.removeEventListener("pagehide", sair);
      sair();
    };
  }, [salvar]);

  // Atendimentos HIPRO da cliente (60 dias para trás e para frente).
  useEffect(() => {
    let ativo = true;
    if (!cliente || portal) {
      setEventos([]);
      return;
    }
    const hoje = new Date();
    const de = new Date(hoje.getTime() - 60 * 86400000).toISOString().slice(0, 10);
    const ate = new Date(hoje.getTime() + 60 * 86400000).toISOString().slice(0, 10);
    supabase
      .from("calendar_events")
      .select("id, date_start, event_type")
      .eq("client_id", cliente)
      .in("event_type", ["hipro_1", "hipro_2"])
      .neq("status", "cancelada")
      .gte("date_start", de)
      .lte("date_start", ate)
      .order("date_start", { ascending: false })
      .then(({ data }) => {
        if (ativo) setEventos((data ?? []) as Evento[]);
      });
    return () => {
      ativo = false;
    };
  }, [cliente, supabase, portal]);

  function mudarLigacao(novoCliente: string, novoEvento: string) {
    setCliente(novoCliente);
    setEvento(novoEvento);
    ligacao.current = { cliente: novoCliente, evento: novoEvento };
    const prof = clientes.find((c) => c.id === novoCliente)?.profissional;
    if (prof && !planoRef.current.profissional.trim()) campo("profissional", prof);
    else agendar();
  }

  // "Montar pelas regras": troca áreas e disparos, mantém paciente, datas e anotações.
  function aplicarSeletor(m: PlanejamentoMontado) {
    if (totalDistribuido(plano) > 0 && !window.confirm("Trocar as áreas e disparos deste planejamento pelo que foi montado?")) return false;
    const montado = normalizarPlano({ ...paraEstado(plano), DATA: m.estado.DATA, customAreas: m.estado.customAreas, customSeq: m.estado.customSeq, saldoTotal: m.estado.saldoTotal, procNome: m.estado.procNome, ...(m.estado.queixa ? { queixa: m.estado.queixa } : {}) });
    mudar(() => montado);
    setAbertas(new Set(todasAreas(montado).filter((a) => totalArea(montado, a) > 0).map((a) => a.id)));
    setSeletor(false);
    irPara("areas");
    mostrarAviso("Planejamento montado pelas regras.");
  }

  async function guardarAgora() {
    if (timer.current) clearTimeout(timer.current);
    await salvar();
  }

  async function novo() {
    setMenu(false);
    await guardarAgora();
    window.location.href = portal ? "/portal/novo" : linkNovoPlanejamento(cliente || null, evento || null);
  }

  // Mesmo plano para outro paciente: copia áreas, saldo e procedimento; zera paciente e "feito".
  async function duplicar() {
    setMenu(false);
    await guardarAgora();
    const est = paraEstado(plano);
    const DATA = Object.fromEntries(Object.entries(plano.DATA).map(([k, ls]) => [k, ls.map(({ feito: _f, ...l }) => l)]));
    try {
      sessionStorage.setItem(CHAVE_PLANO_IA, JSON.stringify({ ...est, paciente: "", dataRetorno: "", obs: "", DATA }));
    } catch {
      return mostrarAviso("Não consegui duplicar neste aparelho.");
    }
    const destino = portal ? "/portal/novo" : linkNovoPlanejamento(cliente || null, evento || null);
    window.location.href = `${destino}${destino.includes("?") ? "&" : "?"}ia=1`;
  }

  async function excluir() {
    setMenu(false);
    if (!id) {
      router.push(base);
      return;
    }
    if (!window.confirm("Excluir este planejamento? Não dá para desfazer.")) return;
    if (timer.current) clearTimeout(timer.current);
    sujo.current = false;
    const { error } = await supabase.rpc("excluir_planejamento", { p_id: id });
    if (error) {
      setStatus("erro");
      return;
    }
    router.push(base);
    router.refresh();
  }

  function irPara(a: Aba) {
    setAba(a);
    rolagem.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function irParaArea(areaId: string) {
    setSoPreenchidas(false);
    setAbertas((s) => new Set(s).add(areaId));
    setAba("areas");
    setTimeout(() => document.getElementById(`area-${areaId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function criarArea(a: Omit<Area, "id">, prof: string) {
    const seq = plano.customSeq + 1;
    const area: Area = { ...a, id: `custom_${seq}` };
    mudar((p) => ({ ...p, customSeq: seq, customAreas: [...p.customAreas, area], DATA: { ...p.DATA, [area.id]: [linhaVazia(area, prof)] } }));
    setNovaArea(false);
    setAbertas((s) => new Set(s).add(area.id));
    setTimeout(() => document.getElementById(`area-${area.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
  }

  function removerArea(a: Area) {
    if (!window.confirm(`Remover a área "${a.nome}"?`)) return;
    mudar((p) => {
      const DATA = { ...p.DATA };
      delete DATA[a.id];
      return { ...p, customAreas: p.customAreas.filter((x) => x.id !== a.id), DATA };
    });
  }

  async function copiarResumo() {
    try {
      await navigator.clipboard.writeText(textoResumo(plano));
      mostrarAviso("Resumo copiado.");
    } catch {
      mostrarAviso("Não consegui copiar neste aparelho.");
    }
  }

  async function compartilharResumo() {
    const texto = textoResumo(plano);
    try {
      if (navigator.share) {
        await navigator.share({ text: texto });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, "_blank");
  }

  function pdf(tipo: "prontuario" | "paciente") {
    const origem = window.location.origin;
    const nome = plano.paciente || "paciente";
    const ok =
      tipo === "prontuario" ? imprimir(htmlProntuario(plano, origem), `Prontuario - ${nome}`) : imprimir(htmlFichaPaciente(plano, origem), `Ficha do paciente - ${nome}`);
    mostrarAviso(ok ? "Abrindo para salvar em PDF…" : "O aparelho bloqueou a janela. Permita pop-ups para o Harmonize.");
  }

  const s = situacaoSaldo(plano);
  const nAreas = areasPreenchidas(plano);
  const nAlertas = alertas(plano).length;
  const nomeCliente = useMemo(() => clientes.find((c) => c.id === cliente)?.name, [clientes, cliente]);
  const quemAtende = nomeCliente || plano.profissional;
  const areas = todasAreas(plano).filter((a) => !soPreenchidas || totalArea(plano, a) > 0);
  const voltar = portal ? base : cliente ? `/planejador?cliente=${cliente}` : "/planejador";
  const usado = s.saldo > 0 ? Math.min(100, (s.total / s.saldo) * 100) : s.total > 0 ? 100 : 0;
  const corBarra = s.estado === "estourado" ? "bg-rose-500" : s.estado === "baixo" ? "bg-amber-400" : "bg-brand-gradient";
  const entrada = "w-full rounded-xl bg-white px-3.5 py-3 text-[15px] text-neutral-900 ring-1 ring-neutral-200 outline-none transition placeholder:text-neutral-400 focus:ring-2 focus:ring-brand-teal disabled:bg-neutral-50";
  const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500";
  const cartao = "rounded-3xl bg-white p-4 shadow-[0_1px_2px_rgba(16,24,40,.04),0_8px_24px_-12px_rgba(16,24,40,.12)] ring-1 ring-neutral-200/80";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#F3F6F7]">
      {/* Topo: volta, paciente e cliente, situação do salvamento, menu. */}
      <header className="relative z-10 bg-white/90 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(16,24,40,.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 pb-1 pt-2">
          <Link href={voltar} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100" aria-label="Voltar para os planejamentos">
            <ArrowLeft size={20} />
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/harmonize-borboleta.png" alt="" className="h-7 w-7 flex-shrink-0 object-contain" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold leading-tight text-neutral-900">{plano.paciente || "Novo planejamento"}</p>
            <p className="truncate text-xs text-neutral-500">
              {quemAtende ? quemAtende : "Planejador HIPRO"}
              {plano.procNome ? ` · ${plano.procNome}` : ""}
            </p>
          </div>
          <span className="flex flex-shrink-0 items-center text-xs text-neutral-500" aria-live="polite">
            {somenteLeitura ? (
              <span className="rounded-full bg-neutral-100 px-2 py-1">Só ver</span>
            ) : status === "salvando" ? (
              <Loader2 size={16} className="animate-spin text-neutral-400" />
            ) : status === "salvo" ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">
                <Check size={13} /> Salvo
              </span>
            ) : status === "erro" ? (
              <button onClick={guardarAgora} className="rounded-full bg-rose-50 px-2 py-1 font-semibold text-rose-600">
                Não salvou · tentar
              </button>
            ) : null}
          </span>
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} className="flex h-10 w-10 items-center justify-center rounded-full text-neutral-600 active:bg-neutral-100" aria-label="Mais opções">
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-11 z-20 w-60 overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-neutral-200">
                  {!somenteLeitura && (
                    <>
                      <button onClick={novo} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                        <Plus size={16} /> Novo planejamento
                      </button>
                      <button onClick={duplicar} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                        <Copy size={16} /> Duplicar para outro paciente
                      </button>
                    </>
                  )}
                  <button onClick={() => (setMenu(false), pdf("prontuario"))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                    <FileText size={16} /> PDF do prontuário
                  </button>
                  <button onClick={() => (setMenu(false), pdf("paciente"))} className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm text-neutral-800 active:bg-neutral-50">
                    <UserRound size={16} /> PDF do paciente
                  </button>
                  {!somenteLeitura && (
                    <button onClick={excluir} className="flex w-full items-center gap-2.5 border-t border-neutral-100 px-4 py-3 text-left text-sm text-rose-600 active:bg-rose-50">
                      <Trash2 size={16} /> Excluir planejamento
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Saldo sempre à vista. */}
        <div className="mx-auto max-w-3xl px-4 pb-2.5">
          <button type="button" onClick={() => s.saldo <= 0 && irPara("paciente")} className="block w-full text-left">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-neutral-500">{s.saldo > 0 ? "Saldo restante" : "Saldo de disparos"}</p>
                <p className={`text-[28px] font-black leading-none tabular-nums ${s.estado === "estourado" ? "text-rose-600" : s.estado === "baixo" ? "text-amber-600" : "text-neutral-900"}`}>
                  {s.saldo > 0 ? fmt(s.resta) : <span className="text-base font-bold text-brand-teal-dark">Toque para definir</span>}
                </p>
              </div>
              <p className="pb-0.5 text-right text-xs leading-tight text-neutral-500">
                <b className="tabular-nums text-neutral-800">{fmt(s.total)}</b>
                {s.saldo > 0 ? <> de {fmt(s.saldo)}</> : " distribuídos"}
                <br />
                {nAreas} área{nAreas === 1 ? "" : "s"}
                {nAlertas > 0 && <span className="ml-1 font-semibold text-amber-600">· {nAlertas} alerta{nAlertas > 1 ? "s" : ""}</span>}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-200/80">
              <div className={`h-full rounded-full transition-all duration-500 ease-out ${corBarra}`} style={{ width: `${usado}%` }} />
            </div>
          </button>
        </div>

        {/* Abas. */}
        <div className="mx-auto max-w-3xl px-3 pb-2">
          <div className="relative grid grid-cols-3 rounded-2xl bg-neutral-100 p-1">
            <span
              className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-xl bg-white shadow-sm transition-transform duration-300 ease-out"
              style={{ transform: `translateX(${aba === "paciente" ? 0 : aba === "areas" ? 100 : 200}%)` }}
            />
            {(
              [
                ["paciente", "Paciente"],
                ["areas", `Áreas${nAreas ? ` · ${nAreas}` : ""}`],
                ["resumo", "Resumo"],
              ] as [Aba, string][]
            ).map(([k, r]) => (
              <button key={k} onClick={() => irPara(k)} className={`relative z-10 rounded-xl py-2 text-[13px] font-bold transition-colors ${aba === k ? "text-neutral-900" : "text-neutral-500"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <div className="h-[2px] bg-brand-gradient opacity-70" />
      </header>

      <div ref={rolagem} className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-3xl space-y-3 px-4 pb-32 pt-4">
          {aba === "paciente" && (
            <div key="paciente" className="space-y-3 animate-[aparecer_.25s_ease-out]">
              {!portal && (
                <div className={cartao}>
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Cliente e atendimento</p>
                  <div className="space-y-3">
                    <ClientPicker clients={clientes} value={cliente} onChange={(c) => mudarLigacao(c, "")} onClientCreated={() => {}} label="Cliente (profissional)" optional noneLabel="Sem cliente" allowCreate={false} />
                    <div>
                      <label className="mb-1 block text-xs font-medium text-neutral-600">Atendimento</label>
                      <select value={evento} onChange={(e) => mudarLigacao(cliente, e.target.value)} disabled={!cliente} className={entrada}>
                        <option value="">{cliente ? "Sem atendimento" : "Escolha a cliente"}</option>
                        {evento && !eventos.some((e) => e.id === evento) && <option value={evento}>Atendimento ligado</option>}
                        {eventos.map((e) => (
                          <option key={e.id} value={e.id}>
                            {formatDate(e.date_start)} · {EQUIP[e.event_type] ?? e.event_type}
                          </option>
                        ))}
                      </select>
                    </div>
                    {(cliente || evento) && (
                      <div className="flex flex-wrap gap-2">
                        {cliente && (
                          <Link href={linkCliente(cliente)} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                            <UserRound size={13} /> Ficha da cliente
                          </Link>
                        )}
                        {evento && (
                          <Link href={linkEvento(evento)} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                            <CalendarDays size={13} /> Atendimento
                          </Link>
                        )}
                        {cliente && (
                          <Link href={`/planejador?cliente=${cliente}`} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-semibold text-neutral-700">
                            <ClipboardCopy size={13} /> Outros pacientes dela
                          </Link>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className={cartao}>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Paciente</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className={rotulo}>Nome do paciente</span>
                    <input value={plano.paciente} onChange={(e) => campo("paciente", e.target.value)} placeholder="Nome completo" autoComplete="off" className={`${entrada} text-base font-semibold`} />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block min-w-0">
                      <span className={rotulo}>Data</span>
                      <input type="date" value={plano.data} onChange={(e) => campo("data", e.target.value)} className={entrada} />
                    </label>
                    <label className="block min-w-0">
                      <span className={rotulo}>Retorno</span>
                      <input type="date" value={plano.dataRetorno} onChange={(e) => campo("dataRetorno", e.target.value)} className={entrada} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={rotulo}>Queixa principal</span>
                    <input value={plano.queixa} onChange={(e) => campo("queixa", e.target.value)} placeholder="Ex.: flacidez de papada" className={entrada} />
                  </label>
                  <label className="block">
                    <span className={rotulo}>Profissional</span>
                    <input value={plano.profissional} onChange={(e) => campo("profissional", e.target.value)} placeholder="Nome do profissional" className={entrada} />
                  </label>
                  <div className="grid grid-cols-[1fr_140px] gap-2">
                    <label className="block min-w-0">
                      <span className={rotulo}>Procedimento</span>
                      <input value={plano.procNome} onChange={(e) => campo("procNome", e.target.value)} placeholder="Ex.: HIPRO Full Face" className={entrada} />
                    </label>
                    <label className="block min-w-0">
                      <span className={rotulo}>Valor</span>
                      <input value={plano.valorProc} onChange={(e) => campo("valorProc", mascaraReais(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" className={entrada} />
                    </label>
                  </div>
                </div>
              </div>

              <div className={cartao}>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Saldo de disparos</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {PERFIS.map((pf) => {
                    const on = plano.perfil === pf.valor;
                    return (
                      <button
                        key={pf.valor}
                        type="button"
                        onClick={() => mudar((p) => ({ ...p, perfil: pf.valor, saldoTotal: String(pf.disparos) }))}
                        className={`rounded-2xl px-1 py-2.5 text-center ring-1 transition ${on ? "bg-brand-teal text-white ring-brand-teal shadow-glow-teal" : "bg-white text-neutral-700 ring-neutral-200"}`}
                      >
                        <span className="block text-xs font-bold">{pf.nome}</span>
                        <span className={`block text-[10px] tabular-nums ${on ? "text-white/85" : "text-neutral-400"}`}>{pf.disparos ? fmt(pf.disparos) : "—"}</span>
                      </button>
                    );
                  })}
                </div>
                <label className="mt-3 block">
                  <span className={rotulo}>Saldo total</span>
                  <input
                    inputMode="numeric"
                    value={plano.saldoTotal === "0" ? "" : fmt(Number(plano.saldoTotal))}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => campo("saldoTotal", String(Number(e.target.value.replace(/\D/g, "")) || 0))}
                    className={`${entrada} text-2xl font-black tabular-nums`}
                  />
                </label>
              </div>

              <div className={cartao}>
                <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Anotações</p>
                <div className="space-y-3">
                  <label className="block">
                    <span className={rotulo}>Observações clínicas</span>
                    <textarea value={plano.obs} onChange={(e) => campo("obs", e.target.value)} rows={3} placeholder="Anotações, contraindicações, observações gerais..." className={`${entrada} resize-y`} />
                  </label>
                  <label className="block">
                    <span className={rotulo}>Recomendações ao paciente</span>
                    <textarea value={plano.recomendacoes} onChange={(e) => campo("recomendacoes", e.target.value)} rows={2} placeholder="Cuidados pós-procedimento..." className={`${entrada} resize-y`} />
                  </label>
                </div>
              </div>

              {!somenteLeitura && (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setSeletor(true)} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-brand-teal-dark ring-1 ring-brand-teal/40">
                    <ListChecks size={17} /> Montar pelas regras
                  </button>
                  {!portal ? (
                    <Link
                      href={`/assistente?${cliente ? `cliente=${cliente}&` : ""}pergunta=${encodeURIComponent(
                        `Monta um planejamento: paciente ${plano.paciente}, saldo de ${plano.saldoTotal !== "0" ? plano.saldoTotal : ""} disparos, queixa principal: ${plano.queixa}`
                      )}`}
                      className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-[#7a5fa0] ring-1 ring-brand-lilac/50"
                    >
                      <Sparkles size={17} /> Montar com a IA
                    </Link>
                  ) : (
                    <button type="button" onClick={() => irPara("areas")} className="flex items-center justify-center gap-2 rounded-2xl bg-white py-3.5 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200">
                      Preencher à mão
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {aba === "areas" && (
            <div key="areas" className="space-y-3 animate-[aparecer_.25s_ease-out]">
              <div className="flex items-center gap-2">
                <div className="flex rounded-full bg-white p-1 ring-1 ring-neutral-200">
                  <button type="button" onClick={() => setSoPreenchidas(false)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${!soPreenchidas ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>
                    Todas
                  </button>
                  <button type="button" onClick={() => setSoPreenchidas(true)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${soPreenchidas ? "bg-neutral-900 text-white" : "text-neutral-500"}`}>
                    Preenchidas
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setAbertas((a) => (a.size ? new Set() : new Set(areas.map((x) => x.id))))}
                  className="ml-auto text-xs font-semibold text-brand-teal-dark"
                >
                  {abertas.size ? "Fechar todas" : "Abrir todas"}
                </button>
              </div>
              {areas.length === 0 && <p className="rounded-3xl bg-white p-6 text-center text-sm text-neutral-500 ring-1 ring-neutral-200">Nenhuma área com disparos ainda.</p>}
              <div className="gap-3 md:columns-2 [&>*]:mb-3 [&>*]:break-inside-avoid">
                {areas.map((a) => (
                  <CartaoArea
                    key={a.id}
                    area={a}
                    linhas={plano.DATA[a.id] ?? []}
                    total={totalArea(plano, a)}
                    aberto={abertas.has(a.id)}
                    onAlternar={() =>
                      setAbertas((s0) => {
                        const n = new Set(s0);
                        if (n.has(a.id)) n.delete(a.id);
                        else n.add(a.id);
                        return n;
                      })
                    }
                    onLinhas={(ls: Linha[]) => mudar((p) => ({ ...p, DATA: { ...p.DATA, [a.id]: ls.length ? ls : [linhaVazia(a)] } }))}
                    onVerModelo={() => setModelo(a)}
                    onRemoverArea={a.manual && !somenteLeitura ? () => removerArea(a) : undefined}
                  />
                ))}
              </div>
              {!somenteLeitura && (
                <button type="button" onClick={() => setNovaArea(true)} className="flex w-full items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-brand-teal/40 bg-white/60 py-4 text-sm font-bold text-brand-teal-dark active:bg-brand-teal/5">
                  <Plus size={18} /> Adicionar área (rosto ou corporal)
                </button>
              )}
            </div>
          )}

          {aba === "resumo" && (
            <div key="resumo" className="animate-[aparecer_.25s_ease-out]">
              <ResumoPlano plano={plano} onIrParaArea={irParaArea} />
            </div>
          )}
        </div>
      </div>

      {/* Barra de baixo: o próximo passo de cada aba. */}
      {!digitando && (
        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-neutral-200/70 bg-white/90 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl gap-2">
            {aba === "paciente" && (
              <button onClick={() => irPara("areas")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal active:scale-[0.99]">
                Distribuir nas áreas <ArrowRight size={17} />
              </button>
            )}
            {aba === "areas" && (
              <button onClick={() => irPara("resumo")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal active:scale-[0.99]">
                Ver resumo <ArrowRight size={17} />
              </button>
            )}
            {aba === "resumo" && (
              <>
                <button onClick={copiarResumo} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white py-3.5 text-sm font-bold text-neutral-800 ring-1 ring-neutral-200">
                  <Copy size={16} /> Copiar
                </button>
                <button onClick={compartilharResumo} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-3.5 text-sm font-bold text-white">
                  <Share2 size={16} /> Enviar
                </button>
                <button onClick={() => pdf("prontuario")} className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal">
                  <FileText size={16} /> PDF
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {aviso && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-30 flex justify-center px-4">
          <p className="rounded-full bg-neutral-900/90 px-4 py-2 text-sm font-medium text-white shadow-lg animate-[aparecer_.2s_ease-out]">{aviso}</p>
        </div>
      )}

      <FolhaModelo area={modelo} onFechar={() => setModelo(null)} />
      <FolhaNovaArea aberta={novaArea} onFechar={() => setNovaArea(false)} onCriar={criarArea} />
      <Folha aberta={seletor} onFechar={() => setSeletor(false)} titulo="Montar pelas regras">
        <SeletorPlanejamento
          saldoInicial={Number(plano.saldoTotal) || null}
          queixaInicial={plano.queixa || null}
          paciente={plano.paciente || null}
          textoAplicar="Colocar no planejador"
          onAplicar={aplicarSeletor}
        />
      </Folha>
    </div>
  );
}
