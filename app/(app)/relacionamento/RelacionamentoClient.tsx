"use client";

// Tela Relacionamento: "Chamar hoje" (até 8 pessoas por dia, por prioridade,
// com a mensagem de WhatsApp pronta) e a carteira de clientes e leads com a
// classificação automática. Conversar (WhatsApp ou "Já falei") grava o
// contato como tarefa concluída, e a pessoa só volta quando a cadência da
// classe dela vencer de novo.

import { useMemo, useState, useEffect } from "react";
import MenuAtalhosCliente from "@/components/MenuAtalhosCliente";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarCheck,
  Check,
  ChevronRight,
  CircleCheck,
  Flame,
  Gem,
  Star,
  MessageCircle,
  Moon,
  Search,
  SkipForward,
  Snowflake,
  Sparkles,
  Sprout,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { IconeChip, type CorVisual } from "@/components/ui/Visual";
import HeroTela from "@/components/ui/HeroTela";
import { createClient } from "@/lib/supabase/client";
import { buildWhatsAppLink, formatCurrency } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import {
  ROTULO_CLASSE,
  ROTULO_VALOR,
  mensagemRelacionamento,
  type Classe,
  type PessoaClassificada,
} from "@/lib/relacionamento";
import { avisar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

type Aba = "hoje" | "clientes" | "leads";

// Ícone e cor de cada classe (padrão visual: ícone em quadradinho, sem emoji).
const VISUAL: Record<Classe, { icone: LucideIcon; cor: CorVisual }> = {
  agendada: { icone: CalendarCheck, cor: "rosa" },
  nova: { icone: Sprout, cor: "verde" },
  ativa: { icone: CircleCheck, cor: "teal" },
  em_risco: { icone: AlertTriangle, cor: "ambar" },
  sumida: { icone: Moon, cor: "cinza" },
  quente: { icone: Flame, cor: "vermelho" },
  morna: { icone: Sun, cor: "ambar" },
  fria: { icone: Snowflake, cor: "azul" },
};
const CHAVE_PULOS = "harmonize-relacionamento-pulos";

const CLASSES_CLIENTE: Classe[] = ["em_risco", "nova", "ativa", "agendada", "sumida"];
const CLASSES_LEAD: Classe[] = ["quente", "morna", "fria"];

function Selo({ classe }: { classe: Classe }) {
  const c = ROTULO_CLASSE[classe];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${c.cor}`}>
      {(() => {
        const I = VISUAL[classe].icone;
        return <I size={12} strokeWidth={2.4} />;
      })()}
      {c.rotulo}
    </span>
  );
}

function SeloValor({ p }: { p: PessoaClassificada }) {
  const v = ROTULO_VALOR[p.valor];
  if (!v) return null;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${v.cor}`}>
      {p.valor === "vip" ? <Gem size={12} strokeWidth={2.4} /> : <Star size={12} strokeWidth={2.4} />}
      {v.rotulo}
    </span>
  );
}

function nomeCurto(p: PessoaClassificada) {
  return [p.treatment, p.displayName || p.nome].filter(Boolean).join(" ");
}

function quando(dias: number | null): string {
  if (dias === null) return "nunca";
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export default function RelacionamentoClient({
  pessoas,
  hoje,
  abaInicial,
  limiteDiario,
}: {
  pessoas: PessoaClassificada[];
  hoje: string;
  abaInicial: Aba;
  limiteDiario: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [aba, setAba] = useState<Aba>(abaInicial);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [pulados, setPulados] = useState<Set<string>>(new Set());
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Classe | "vip" | null>(null);
  const [busca, setBusca] = useState("");

  // "Pular hoje" vale só para hoje e só neste aparelho.
  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(CHAVE_PULOS) ?? "{}");
      if (salvo.dia === hoje) setPulados(new Set(salvo.ids ?? []));
    } catch {
      // sem armazenamento: segue sem os pulos
    }
  }, [hoje]);

  function pular(id: string) {
    const novo = new Set(pulados).add(id);
    setPulados(novo);
    try {
      localStorage.setItem(CHAVE_PULOS, JSON.stringify({ dia: hoje, ids: Array.from(novo) }));
    } catch {
      // sem armazenamento
    }
  }

  const devidas = useMemo(() => pessoas.filter((p) => p.devida), [pessoas]);
  const fila = devidas.filter((p) => !pulados.has(p.id)).slice(0, limiteDiario + feitos.size);
  const filaVisivel = fila.filter((p) => !feitos.has(p.id)).slice(0, limiteDiario);
  const restantes = Math.max(0, devidas.length - pulados.size - feitos.size - filaVisivel.length);

  const clientes = pessoas.filter((p) => p.ehCliente || p.locacoes.length > 0);
  const leads = pessoas.filter((p) => !(p.ehCliente || p.locacoes.length > 0));
  const contar = (lista: PessoaClassificada[], c: Classe) => lista.filter((p) => p.classe === c).length;
  const vips = clientes.filter((p) => p.valor === "vip").length;

  async function registrarContato(p: PessoaClassificada, comoFoi: string) {
    setOcupado(p.id);
    const agora = new Date().toISOString();
    // Fecha as tarefas de conversa que estavam esperando por ela; sem nenhuma,
    // grava o contato como tarefa concluída (o recontato automático conta daí).
    const { data: abertas, error: erroBusca } = await supabase
      .from("tasks")
      .select("id")
      .eq("client_id", p.id)
      .eq("status", "pendente")
      .in("type", ["recontato", "contato_inicial", "followup"]);
    // Sem saber das pendentes, gravar uma nova deixaria as antigas abertas.
    if (erroBusca) {
      setOcupado(null);
      avisar("Não consegui conferir as tarefas dela. Confira a internet e tente de novo.", "erro");
      return false;
    }
    let erro = null;
    if (abertas && abertas.length > 0) {
      ({ error: erro } = await supabase
        .from("tasks")
        .update({ status: "concluida", completed_at: agora })
        .in("id", abertas.map((t) => t.id)));
    } else {
      ({ error: erro } = await supabase.from("tasks").insert({
        client_id: p.id,
        type: p.ehCliente || p.locacoes.length > 0 ? "recontato" : "followup",
        title: `Conversa (${comoFoi}): ${ROTULO_CLASSE[p.classe].rotulo}`,
        status: "concluida",
        completed_at: agora,
        due_date: hoje,
      }));
    }
    setOcupado(null);
    if (erro) {
      avisar("Não consegui registrar a conversa. Tente de novo.", "erro");
      return false;
    }
    setFeitos((f) => new Set(f).add(p.id));
    return true;
  }

  async function whatsapp(p: PessoaClassificada) {
    const msg = mensagemRelacionamento(p, saudacaoCurta({ name: p.nome, treatment: p.treatment, displayName: p.displayName }));
    const link = buildWhatsAppLink(p.whatsapp, msg);
    if (!link) {
      avisar("Sem WhatsApp no cadastro. Abra a ficha para completar.", "erro");
      return;
    }
    window.open(link, "_blank");
    if (await registrarContato(p, "WhatsApp")) avisar(`Conversa com ${nomeCurto(p)} registrada.`);
  }

  async function jaFalei(p: PessoaClassificada) {
    if (await registrarContato(p, "registrado")) avisar(`Conversa com ${nomeCurto(p)} registrada.`);
  }

  function trocarAba(a: Aba) {
    setAba(a);
    setFiltro(null);
    setBusca("");
    const url = new URL(window.location.href);
    if (a === "hoje") url.searchParams.delete("aba");
    else url.searchParams.set("aba", a);
    window.history.replaceState(null, "", url.pathname + url.search);
  }

  const listaCarteira = (aba === "clientes" ? clientes : leads)
    .filter((p) => (filtro === "vip" ? p.valor === "vip" : !filtro || p.classe === filtro))
    .filter((p) => !busca.trim() || `${p.nome} ${p.cidade ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()))
    .sort((a, b) => b.totalFaturado - a.totalFaturado || a.nome.localeCompare(b.nome, "pt-BR"));

  const totalHoje = filaVisivel.length + feitos.size;

  return (
    <div className="space-y-4">
      <HeroTela
        etiqueta="Relacionamento"
        rotulo="Conversas de hoje"
        valor={
          <>
            {feitos.size} <span className="text-base font-semibold text-teal-100">de {totalHoje}</span>
          </>
        }
        apoio={restantes > 0 ? `+${restantes} esperando os próximos dias` : "Ninguém esquecido"}
        anel={{ fracao: totalHoje ? feitos.size / totalHoje : 1, texto: `${totalHoje ? Math.round((feitos.size / totalHoje) * 100) : 100}%`, legenda: "feito" }}
        chips={[
          { texto: `${clientes.length} ${clientes.length === 1 ? "cliente" : "clientes"}`, icone: Users },
          { texto: `${leads.length} ${leads.length === 1 ? "lead" : "leads"}`, icone: Sparkles },
        ]}
      />

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1">
        {(
          [
            ["hoje", `Chamar hoje${filaVisivel.length ? ` · ${filaVisivel.length}` : ""}`],
            ["clientes", `Clientes · ${clientes.length}`],
            ["leads", `Leads · ${leads.length}`],
          ] as [Aba, string][]
        ).map(([a, r]) => (
          <button
            key={a}
            type="button"
            onClick={() => trocarAba(a)}
            className={`rounded-xl py-2 text-xs font-bold transition ${aba === a ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
          >
            {r}
          </button>
        ))}
      </div>

      {aba === "hoje" && (
        <>
          <p className="px-1 text-[12px] leading-snug text-slate-500">
            No máximo {limiteDiario} por dia, quem vale mais e está há mais tempo sem conversa primeiro. Mandou mensagem, a pessoa sai da lista e volta só no tempo certo.
          </p>

          {filaVisivel.length === 0 ? (
            <div className="flex flex-col items-center gap-2 cartao p-6 text-center">
              <Sparkles className="text-brand-teal" />
              <p className="text-sm font-bold text-neutral-900">{feitos.size ? "Fila de hoje concluída 🎉" : "Ninguém para chamar hoje"}</p>
              <p className="text-xs text-neutral-500">Amanhã a lista se monta de novo, sozinha.</p>
            </div>
          ) : (
            <ul className="space-y-2.5">
              {filaVisivel.map((p) => (
                <li key={p.id} className="cartao p-4">
                  <div className="flex items-start gap-3">
                    <IconeChip icone={VISUAL[p.classe].icone} cor={VISUAL[p.classe].cor} tamanho="lg" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/clientes/${p.id}`} className="block truncate text-[15px] font-bold text-neutral-900">
                        {nomeCurto(p)}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Selo classe={p.classe} />
                        <SeloValor p={p} />
                        {p.deve > 0 && (
                          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10.5px] font-bold text-rose-600">deve {formatCurrency(p.deve)}</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[13px] leading-snug text-neutral-700">{p.motivo}</p>
                      <p className="mt-0.5 text-[11.5px] text-neutral-400">
                        Última conversa {quando(p.ultimoContato ? p.diasSemContato : null)}
                        {p.cidade ? ` · ${p.cidade}` : ""}
                        {p.totalFaturado > 0 ? ` · ${formatCurrency(p.totalFaturado)} em ${p.locacoes.length} locaç${p.locacoes.length === 1 ? "ão" : "ões"}` : ""}
                      </p>
                    </div>
                    <MenuAtalhosCliente
                      clienteId={p.id}
                      nome={p.nome}
                      nomeCurto={p.displayName}
                      tratamento={p.treatment}
                      className="-mr-2 -mt-2 flex-shrink-0"
                    />
                  </div>
                  {!somenteLeitura && (
                    <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
                      <button
                        type="button"
                        disabled={ocupado === p.id}
                        onClick={() => whatsapp(p)}
                        className="flex items-center justify-center gap-1.5 rounded-2xl bg-emerald-600 py-2.5 text-sm font-bold text-white active:bg-emerald-700 disabled:opacity-60"
                      >
                        <MessageCircle size={16} /> WhatsApp
                      </button>
                      <button
                        type="button"
                        disabled={ocupado === p.id}
                        onClick={() => jaFalei(p)}
                        className="flex items-center gap-1 rounded-2xl bg-neutral-100 px-3 text-xs font-bold text-neutral-700 active:bg-neutral-200"
                      >
                        <Check size={15} /> Já falei
                      </button>
                      <button
                        type="button"
                        onClick={() => pular(p.id)}
                        className="flex items-center gap-1 rounded-2xl px-2 text-xs font-semibold text-neutral-400"
                        aria-label="Pular hoje"
                      >
                        <SkipForward size={15} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {aba !== "hoje" && (
        <>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setFiltro(null)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${!filtro ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"}`}
            >
              Todos
            </button>
            {aba === "clientes" && vips > 0 && (
              <button
                type="button"
                onClick={() => setFiltro("vip")}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${filtro === "vip" ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"}`}
              >
                VIP · {vips}
              </button>
            )}
            {(aba === "clientes" ? CLASSES_CLIENTE : CLASSES_LEAD).map((c) => {
              const n = contar(aba === "clientes" ? clientes : leads, c);
              if (!n) return null;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFiltro(c)}
                  className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-bold ${filtro === c ? "bg-neutral-900 text-white" : "bg-white text-neutral-600 ring-1 ring-neutral-200"}`}
                >
                  {ROTULO_CLASSE[c].rotulo} · {n}
                </button>
              );
            })}
          </div>
          {filtro && filtro !== "vip" && <p className="-mt-2 px-1 text-xs text-neutral-500">{ROTULO_CLASSE[filtro].dica}.</p>}

          <label className="flex items-center gap-2 rounded-2xl bg-white px-3 ring-1 ring-neutral-200">
            <Search size={16} className="text-neutral-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou cidade"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
            />
          </label>

          <ul className="cartao">
            {listaCarteira.length === 0 && <li className="p-6 text-center text-sm text-neutral-400">Ninguém aqui.</li>}
            {listaCarteira.slice(0, 200).map((p) => (
              <li key={p.id} className="flex items-center border-b border-neutral-100 pr-2 last:border-0">
                <Link href={`/clientes/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 active:bg-neutral-50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-neutral-900">{nomeCurto(p)}</span>
                      {p.devida && <span className="h-2 w-2 flex-shrink-0 rounded-full bg-amber-400" title="Hora de conversar" />}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      <Selo classe={p.classe} />
                      <SeloValor p={p} />
                    </span>
                    <span className="mt-1 block truncate text-[11.5px] text-neutral-500">
                      {p.ultimaLocacao ? `Última locação ${quando(p.diasSemLocar)} · ` : ""}
                      conversa {quando(p.ultimoContato ? p.diasSemContato : null)}
                      {p.proximaReserva ? ` · marcada ${p.proximaReserva.split("-").reverse().slice(0, 2).join("/")}` : ""}
                    </span>
                  </span>
                  {p.totalFaturado > 0 && <span className="text-xs font-bold tabular-nums text-neutral-700">{formatCurrency(p.totalFaturado)}</span>}
                  <ChevronRight size={16} className="flex-shrink-0 text-neutral-300" />
                </Link>
                <MenuAtalhosCliente clienteId={p.id} nome={p.nome} nomeCurto={p.displayName} tratamento={p.treatment} className="flex-shrink-0" />
              </li>
            ))}
          </ul>
          {listaCarteira.length > 200 && <p className="text-center text-xs text-neutral-400">Mostrando 200 de {listaCarteira.length}. Use a busca.</p>}
        </>
      )}

      <button type="button" onClick={() => router.refresh()} className="mx-auto block text-xs font-semibold text-neutral-400">
        Atualizar a lista
      </button>
    </div>
  );
}
