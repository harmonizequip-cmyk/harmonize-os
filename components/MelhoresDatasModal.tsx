"use client";

// Melhores datas por logística (menu ⋮ da cliente): as datas livres do mês
// separadas pela distância da cidade da pessoa até onde o Eder vai estar no
// dia anterior ou no seguinte, num termômetro (Perto, Mais ou menos, Longe) e
// em grupos. Só lê o banco; visualização também vê. Regras em lib/datas-logistica.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Copy,
  Loader2,
  MapPin,
  MessageCircle,
  Snowflake,
  Thermometer,
  ThermometerSun,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { buscarTodas } from "@/lib/buscar-todas";
import { carregarMapaCidades } from "@/lib/carregar-cidades";
import { agendaDoEncaixe, type EventoComCidade } from "@/lib/encaixe";
import type { MapaCidades } from "@/lib/cidades-coordenadas";
import { buildWhatsAppLink } from "@/lib/format";
import { hojeLocal, somarDias } from "@/lib/period";
import { saudacaoCurta } from "@/lib/saudacao";
import { usePreferencias } from "@/lib/usar-preferencias";
import {
  ORDEM_GRUPOS,
  TITULO_GRUPO,
  larguraDasZonas,
  marcadoresDoTermometro,
  melhoresDatas,
  mensagemMelhoresDatas,
  mesPadrao,
  nomeDoMes,
  periodoDoMes,
  proximidade,
  rotuloData,
  somarMeses,
  textoDatas,
  textoDias,
  textoReferencia,
  type DataLogistica,
  type GrupoLogistica,
} from "@/lib/datas-logistica";
import { avisar } from "@/components/Dialogos";
import { IconeChip } from "@/components/ui/Visual";

// Paleta validada para daltonismo (a dos gráficos), sempre com rótulo e ícone.
const ESTILO: Record<GrupoLogistica, { cor: string; texto: string; fundo: string; icone: LucideIcon; dica: string }> = {
  perto: { cor: "#1F9E97", texto: "text-[#167a74]", fundo: "bg-[#1F9E97]/10", icone: ThermometerSun, dica: "você já estará por perto" },
  medio: { cor: "#F59E0B", texto: "text-amber-700", fundo: "bg-amber-50", icone: Thermometer, dica: "dá para encaixar" },
  longe: { cor: "#D9577E", texto: "text-[#b03e63]", fundo: "bg-[#D9577E]/10", icone: Snowflake, dica: "longe de onde você estará" },
  sem: { cor: "#94A3B8", texto: "text-slate-600", fundo: "bg-slate-100", icone: CircleDashed, dica: "sem atendimento ao redor ou sem como medir" },
};

interface Pessoa {
  nome: string | null;
  nomeCurto: string | null;
  tratamento: string | null;
  whatsapp: string | null;
  cidade: string | null;
}

interface AgendaMes {
  ocupados: Set<string>;
  eventos: EventoComCidade[];
}

function nomeMesAno(mes: string) {
  const n = nomeDoMes(mes);
  return `${n.charAt(0).toUpperCase()}${n.slice(1)} de ${mes.slice(0, 4)}`;
}

async function carregarAgendaDoMes(mes: string): Promise<AgendaMes> {
  const supabase = createClient();
  const { de, ate } = periodoDoMes(mes);
  const [eventos, { data: bloqueios, error: e2 }] = await Promise.all([
    buscarTodas<{ date_start: string; date_end: string | null; event_type: string | null; clients: unknown }>((a, b) =>
      supabase
        .from("calendar_events")
        .select("id, date_start, date_end, event_type, status, clients(city)")
        .neq("status", "cancelada")
        .eq("is_test", false)
        // Locação de vários dias que começou antes ainda pode cobrir o mês.
        .gte("date_start", somarDias(de, -62))
        .lte("date_start", ate)
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: { date_start: string; date_end: string | null; event_type: string | null; clients: unknown }[] | null; error: { message: string } | null }>
    ).catch(() => {
      throw new Error("Não consegui carregar a agenda do mês. Confira a internet e tente de novo.");
    }),
    supabase.from("bloqueios_equipamento").select("data_inicio, data_fim").lte("data_inicio", ate).gte("data_fim", de),
  ]);
  if (e2) throw new Error(`Não consegui carregar os bloqueios da agenda: ${e2.message}`);
  const { ocupados, comCidade } = agendaDoEncaixe(eventos, bloqueios ?? [], de);
  return { ocupados, eventos: comCidade };
}

export default function MelhoresDatasModal({
  clienteId,
  nome,
  onClose,
}: {
  clienteId: string;
  nome?: string | null;
  onClose: () => void;
}) {
  const prefs = usePreferencias();
  const { pertoKm, raioKm } = prefs.encaixe;
  const hoje = useMemo(() => hojeLocal(), []);
  const mesMinimo = hoje.slice(0, 7);
  const mesMaximo = somarMeses(mesMinimo, 12);
  const [mes, setMes] = useState(() => mesPadrao(hoje));
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [mapa, setMapa] = useState<Readonly<MapaCidades> | null>(null);
  const [agendas, setAgendas] = useState<Record<string, AgendaMes>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  // Datas marcadas por mês (null = ainda não mexeu: vale o padrão, as de "Perto").
  const [marcadas, setMarcadas] = useState<Record<string, Set<string>>>({});
  const [destaque, setDestaque] = useState<string | null>(null);
  const pedidos = useRef(new Set<string>());
  const primeiro = useRef<HTMLButtonElement>(null);

  // Cadastro e mapa de cidades uma vez.
  useEffect(() => {
    let vivo = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("clients").select("name, display_name, treatment, whatsapp, city").eq("id", clienteId).maybeSingle(),
      carregarMapaCidades(supabase),
    ]).then(([{ data, error }, m]) => {
      if (!vivo) return;
      if (error) {
        setErro(`Não consegui carregar o cadastro: ${error.message}`);
        return;
      }
      setPessoa({
        nome: (data?.name as string | null) ?? nome ?? null,
        nomeCurto: (data?.display_name as string | null) ?? null,
        tratamento: (data?.treatment as string | null) ?? null,
        whatsapp: (data?.whatsapp as string | null) ?? null,
        cidade: (data?.city as string | null) ?? null,
      });
      setMapa(m);
    });
    return () => {
      vivo = false;
    };
  }, [clienteId, nome, tentativa]);

  // Agenda do mês escolhido, guardada em memória.
  useEffect(() => {
    if (agendas[mes] || pedidos.current.has(mes)) return;
    pedidos.current.add(mes);
    carregarAgendaDoMes(mes)
      .then((a) => setAgendas((x) => ({ ...x, [mes]: a })))
      .catch((e: Error) => setErro(e.message))
      .finally(() => pedidos.current.delete(mes));
  }, [mes, agendas, tentativa]);

  const fechar = useCallback(() => onClose(), [onClose]);
  const trocarMes = (n: number) => {
    setErro(null);
    setMes((m) => somarMeses(m, n));
  };

  // Esc fecha; trava a rolagem de trás; foco no fechar ao abrir.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar();
      }
    };
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = requestAnimationFrame(() => primeiro.current?.focus());
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
      cancelAnimationFrame(t);
    };
  }, [fechar]);

  const agenda = agendas[mes];
  const datas: DataLogistica[] | null = useMemo(() => {
    if (!agenda || !pessoa || !mapa) return null;
    return melhoresDatas({ mes, hoje, ocupados: agenda.ocupados, eventos: agenda.eventos, cidadePessoa: pessoa.cidade, pertoKm, raioKm, mapa });
  }, [agenda, pessoa, mapa, mes, hoje, pertoKm, raioKm]);

  const selecionadas = useMemo(() => {
    if (marcadas[mes]) return marcadas[mes];
    return new Set((datas ?? []).filter((d) => d.grupo === "perto").map((d) => d.data));
  }, [marcadas, mes, datas]);

  function alternar(dia: string) {
    const nova = new Set(selecionadas);
    if (nova.has(dia)) nova.delete(dia);
    else nova.add(dia);
    setMarcadas((x) => ({ ...x, [mes]: nova }));
  }

  function irPara(dia: string) {
    const el = document.getElementById(`melhor-data-${dia}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setDestaque(dia);
    setTimeout(() => setDestaque((d) => (d === dia ? null : d)), 1600);
  }

  const escolhidas = [...selecionadas].filter((d) => datas?.some((x) => x.data === d));
  const saudacao = saudacaoCurta({ name: pessoa?.nome, treatment: pessoa?.tratamento, displayName: pessoa?.nomeCurto });
  const linkZap = escolhidas.length ? buildWhatsAppLink(pessoa?.whatsapp, mensagemMelhoresDatas(saudacao, mes, escolhidas)) : null;
  const motivoZap = !pessoa ? "carregando..." : !pessoa.whatsapp ? "sem WhatsApp no cadastro" : escolhidas.length === 0 ? "marque ao menos uma data" : null;

  async function copiar() {
    if (!escolhidas.length) return avisar("Marque ao menos uma data.", "erro");
    try {
      await navigator.clipboard.writeText(textoDatas(escolhidas));
      avisar("Datas copiadas.");
    } catch {
      avisar("Não consegui copiar neste aparelho.", "erro");
    }
  }

  const zonas = larguraDasZonas(pertoKm, raioKm);
  const marcadores = datas ? marcadoresDoTermometro(datas, pertoKm, raioKm) : [];
  const niveis = marcadores.reduce((m, x) => Math.max(m, x.nivel + 1), 1);
  const carregando = !erro && !datas;
  const titulo = pessoa?.nome || nome || "Cliente";

  const conteudo = (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        fechar();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Melhores datas para ${titulo}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-3xl bg-white shadow-2xl animate-[subir_.22s_ease-out] sm:max-w-lg sm:rounded-3xl"
      >
        {/* Topo */}
        <div className="flex-shrink-0 px-4 pt-2">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-neutral-200 sm:hidden" />
          <div className="flex items-start gap-3">
            <IconeChip icone={CalendarClock} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold leading-tight text-neutral-900">Melhores datas</p>
              <p className="truncate text-xs text-neutral-500">
                {titulo}
                {pessoa && (
                  <>
                    {" · "}
                    <MapPin size={11} className="-mt-0.5 inline" /> {pessoa.cidade?.trim() || "sem cidade no cadastro"}
                  </>
                )}
              </p>
            </div>
            <button ref={primeiro} type="button" onClick={fechar} className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-500" aria-label="Fechar">
              <X size={16} />
            </button>
          </div>

          {/* Mês */}
          <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl bg-neutral-50 p-1">
            <button
              type="button"
              disabled={mes <= mesMinimo}
              onClick={() => trocarMes(-1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-600 hover:bg-white disabled:opacity-30"
              aria-label="Mês anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="text-sm font-bold text-neutral-800" aria-live="polite">
              {nomeMesAno(mes)}
            </p>
            <button
              type="button"
              disabled={mes >= mesMaximo}
              onClick={() => trocarMes(1)}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-neutral-600 hover:bg-white disabled:opacity-30"
              aria-label="Próximo mês"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Termômetro */}
          <div className="mt-3" aria-label="Termômetro da distância">
            <div className="relative" style={{ height: 6 + niveis * 14 }}>
              {marcadores.map((m) => (
                <button
                  key={m.data}
                  type="button"
                  onClick={() => irPara(m.data)}
                  title={rotuloData(m.data)}
                  aria-label={`${rotuloData(m.data)}: ver na lista`}
                  className="absolute flex h-4 w-4 -translate-x-1/2 items-center justify-center rounded-full"
                  style={{ left: `${Math.min(97, Math.max(3, m.posicao * 100))}%`, bottom: m.nivel * 14 }}
                >
                  <span className="block h-3 w-3 rounded-full ring-2 ring-white" style={{ background: ESTILO[m.grupo].cor }} />
                </button>
              ))}
            </div>
            <div className="flex h-3 overflow-hidden rounded-full">
              {(["perto", "medio", "longe"] as const).map((g) => (
                <div key={g} style={{ width: `${zonas[g] * 100}%`, background: ESTILO[g].cor, opacity: 0.85 }} />
              ))}
            </div>
            <div className="mt-1.5 flex text-[10px] leading-tight">
              {(["perto", "medio", "longe"] as const).map((g) => {
                const E = ESTILO[g];
                const limite = g === "perto" ? `até ${pertoKm} km` : g === "medio" ? `até ${raioKm} km` : `mais de ${raioKm} km`;
                return (
                  <div key={g} style={{ width: `${zonas[g] * 100}%` }} className={`min-w-0 ${g === "longe" ? "text-right" : ""} ${E.texto}`}>
                    <span className="inline-flex items-center gap-0.5 font-bold">
                      <E.icone size={11} /> {TITULO_GRUPO[g]}
                    </span>
                    <span className="block text-neutral-500">{limite}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Lista */}
        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto border-t border-neutral-100 bg-neutral-50/60 px-4 py-3">
          {erro ? (
            <div className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700">
              <p className="font-semibold">{erro}</p>
              <button
                type="button"
                className="mt-2 min-h-[40px] rounded-xl bg-white px-3 text-xs font-bold text-rose-700 ring-1 ring-rose-200"
                onClick={() => {
                  setErro(null);
                  setTentativa((t) => t + 1);
                }}
              >
                Tentar de novo
              </button>
            </div>
          ) : carregando ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-500">
              <Loader2 size={16} className="animate-spin" /> Carregando as datas...
            </p>
          ) : datas && datas.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">Nenhuma data livre nos dois HIPROs em {nomeDoMes(mes)}{mes === mesMinimo ? " a partir de amanhã" : ""}.</p>
          ) : (
            ORDEM_GRUPOS.map((g) => {
              const doGrupo = (datas ?? []).filter((d) => d.grupo === g);
              if (!doGrupo.length) return null;
              const E = ESTILO[g];
              return (
                <section key={g} className="cartao overflow-hidden p-0">
                  <div className={`flex items-center gap-2 px-3 py-2 ${E.fundo}`}>
                    <E.icone size={16} className={E.texto} />
                    <p className={`text-sm font-bold ${E.texto}`}>
                      {TITULO_GRUPO[g]} · {doGrupo.length}
                    </p>
                    <p className="min-w-0 flex-1 truncate text-right text-[11px] text-neutral-500">{E.dica}</p>
                  </div>
                  <ul className="divide-y divide-neutral-100">
                    {doGrupo.map((d) => (
                      <LinhaData key={d.data} d={d} marcada={selecionadas.has(d.data)} destaque={destaque === d.data} onToggle={() => alternar(d.data)} pertoKm={pertoKm} raioKm={raioKm} />
                    ))}
                  </ul>
                </section>
              );
            })
          )}
          <p className="pb-1 text-center text-[11px] text-neutral-400">
            Dia livre: os dois HIPROs sem reserva nem bloqueio, fora domingo. Distância em linha reta até a cidade onde você atende no dia anterior ou no seguinte.
          </p>
        </div>

        {/* Ações */}
        <div className="flex-shrink-0 border-t border-neutral-100 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <p className="mb-2 text-xs text-neutral-500">
            {escolhidas.length === 0 ? "Nenhuma data marcada." : `${escolhidas.length} ${escolhidas.length === 1 ? "data marcada" : "datas marcadas"}: ${textoDatas(escolhidas)}`}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={copiar}
              disabled={!escolhidas.length}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-neutral-100 text-sm font-bold text-neutral-700 disabled:opacity-40"
            >
              <Copy size={15} /> Copiar datas
            </button>
            {linkZap ? (
              <a
                href={linkZap}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-brand-teal text-sm font-bold text-white"
              >
                <MessageCircle size={15} /> Mandar no WhatsApp
              </a>
            ) : (
              <span aria-disabled="true" className="flex min-h-[44px] cursor-not-allowed flex-col items-center justify-center rounded-xl bg-brand-teal/40 text-white">
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <MessageCircle size={15} /> Mandar no WhatsApp
                </span>
                {motivoZap && <span className="text-[10px] font-semibold">{motivoZap}</span>}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(conteudo, document.body);
}

function LinhaData({
  d,
  marcada,
  destaque,
  onToggle,
  pertoKm,
  raioKm,
}: {
  d: DataLogistica;
  marcada: boolean;
  destaque: boolean;
  onToggle: () => void;
  pertoKm: number;
  raioKm: number;
}) {
  const E = ESTILO[d.grupo];
  const r = d.referencia;
  const cheio = r ? proximidade(r.km, pertoKm, raioKm) : 0;
  return (
    <li id={`melhor-data-${d.data}`} className={`transition-colors ${destaque ? "bg-amber-50" : ""}`}>
      <label className="flex min-h-[52px] cursor-pointer items-start gap-3 px-3 py-2.5">
        <input type="checkbox" checked={marcada} onChange={onToggle} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#1F9E97]" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-neutral-900">{rotuloData(d.data)}</span>
            {/* Mini termômetro: cheio = perto, quase vazio = longe. */}
            {r ? (
              <span className="h-2 w-16 overflow-hidden rounded-full bg-neutral-100" role="img" aria-label={`${TITULO_GRUPO[d.grupo]}, ~${Math.round(r.km)} km`}>
                <span className="block h-full rounded-full" style={{ width: `${cheio * 100}%`, background: E.cor }} />
              </span>
            ) : (
              <span className="h-2 w-16 rounded-full border border-dashed border-slate-300" role="img" aria-label="Sem referência" />
            )}
            <span className={`text-xs font-bold ${E.texto}`}>{r ? `~${Math.round(r.km)} km` : ""}</span>
          </span>
          {r ? (
            <>
              <span className="block text-xs text-neutral-600">
                ~{Math.round(r.km)} km de {r.cidade} ({textoReferencia(r)})
              </span>
              {d.outras.length > 0 && (
                <span className="block text-[11px] text-neutral-400">
                  também {d.outras.map((o) => `${o.cidade} (~${Math.round(o.km)} km, ${textoDias(o)})`).join("; ")}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="block text-xs text-neutral-600">{d.motivo}</span>
              {d.cidadesAoRedor.length > 0 && <span className="block text-[11px] text-neutral-400">Ao redor: {d.cidadesAoRedor.join(", ")}</span>}
            </>
          )}
        </span>
      </label>
    </li>
  );
}
