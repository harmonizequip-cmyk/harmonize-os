"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { escutar, podeReconhecerFala } from "@/lib/reconhecer-fala";
import { falar, pararDeFalar, podeFalar } from "@/lib/falar";
import {
  bolhasDoHistorico,
  colunasDaPlanilha,
  trechosMarkdown,
  type Bolha,
  type MensagemWhatsApp,
  type PlanilhaPedida,
  type AgendaPedida,
} from "@/lib/assistente";
import CartaoAgenda from "./CartaoAgenda";
import { exportarTabela } from "@/lib/exportar-planilha";
import { barras, rankingPor, soGraficos } from "@/lib/graficos-exportacao";
import { buildWhatsAppLink } from "@/lib/format";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { Copy, FileSpreadsheet, History, MessageCircle, Mic, Plus, Send, Sparkles, Square, Trash2, UserRound, Volume2, VolumeX, X } from "lucide-react";

const CHAVE_VOZ = "harmonize-assistente-voz";

const SUGESTOES = [
  "Quem está me devendo e há quanto tempo?",
  "Como está o faturamento deste mês comparado ao mês passado?",
  "Tenho dia livre na semana que vem?",
  "Quais tarefas estão atrasadas?",
  "Planilha de quanto cada cliente já gastou comigo",
  "Para quem mando a agenda dos próximos 15 dias?",
];

type ClienteRef = { name: string; display_name: string | null; treatment: string | null } | null;
type Conversa = { id: string; titulo: string; updated_at: string; client_id: string | null; clients: ClienteRef | ClienteRef[] };
type Memoria = { id: string; texto: string; client_id: string | null; clients: ClienteRef | ClienteRef[] };

const umDe = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
function nomeCurto(c: ClienteRef): string {
  if (!c) return "";
  return [c.treatment, c.display_name || c.name].filter(Boolean).join(" ");
}

function BotoesPlanilha({ lista }: { lista: PlanilhaPedida[] }) {
  const supabase = createClient();
  const [baixando, setBaixando] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Roda a consulta de novo na hora de baixar: a planilha sai com o dado de agora.
  async function baixar(p: PlanilhaPedida, i: number) {
    setBaixando(i);
    setErro(null);
    const { data, error } = await supabase.rpc("assistente_consultar", { p_sql: p.sql, p_limite: 5000 });
    if (error) {
      setBaixando(null);
      setErro("Não consegui gerar a planilha. Peça de novo ao assistente.");
      return;
    }
    const linhas = ((Array.isArray(data) ? data : []) as Record<string, unknown>[]).slice(0, 5000);
    const g = p.grafico;
    const graficos = g
      ? soGraficos([
          barras(
            g.titulo || p.titulo,
            rankingPor(linhas, (l) => String(l[g.categoria] ?? ""), (l) => Number(l[g.valor]) || 0),
            {
              serie: p.colunas.find((c) => c.campo === g.valor)?.titulo ?? "Valor",
              formato: g.tipo === "inteiro" ? "inteiro" : "moeda",
            }
          ),
        ])
      : undefined;
    try {
      await exportarTabela(linhas, colunasDaPlanilha(p.colunas), p.titulo, undefined, { titulo: p.titulo, graficos });
    } catch {
      setErro("Não consegui gerar a planilha. Tente de novo.");
    }
    setBaixando(null);
  }

  return (
    <div className="mt-2 space-y-2">
      {lista.map((p, i) => (
        <button
          key={i}
          onClick={() => baixar(p, i)}
          disabled={baixando !== null}
          className="flex w-full items-center gap-3 rounded-xl border border-brand-teal/30 bg-brand-teal/10 px-3 py-2.5 text-left disabled:opacity-60"
        >
          <FileSpreadsheet size={22} className="flex-shrink-0 text-brand-teal-dark" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold text-neutral-800">{p.titulo}</span>
            <span className="block text-[11px] text-neutral-500">
              {baixando === i ? "Gerando..." : `Planilha com ${p.linhas} ${p.linhas === 1 ? "linha" : "linhas"} · toque para baixar`}
            </span>
          </span>
        </button>
      ))}
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}

function BotoesWhatsApp({ lista }: { lista: MensagemWhatsApp[] }) {
  const [copiado, setCopiado] = useState<number | null>(null);
  return (
    <div className="mt-2 space-y-2">
      {lista.map((w, i) => {
        const link = buildWhatsAppLink(w.telefone, w.texto);
        return (
          <div key={i} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5">
            <p className="whitespace-pre-wrap text-[13px] text-neutral-800">{w.texto}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <MessageCircle size={14} /> Abrir no WhatsApp{w.nome ? ` (${w.nome})` : ""}
                </a>
              )}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(w.texto);
                    setCopiado(i);
                    setTimeout(() => setCopiado(null), 2000);
                  } catch {
                    // sem permissão de copiar
                  }
                }}
                className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600"
              >
                <Copy size={13} /> {copiado === i ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Texto({ texto }: { texto: string }) {
  const trechos = trechosMarkdown(texto);
  return (
    <div className="space-y-1.5">
      {trechos.map((t, i) => (
        <p key={i} className={t.tipo === "item" ? "flex gap-2" : ""}>
          {t.tipo === "item" && <span className="text-brand-teal">•</span>}
          <span>
            {t.partes.map((p, j) => (p.negrito ? <strong key={j}>{p.texto}</strong> : <span key={j}>{p.texto}</span>))}
          </span>
        </p>
      ))}
    </div>
  );
}

async function mensagemDeErro(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const corpo = await ctx.json();
      if (corpo?.erro) return corpo.erro;
    } catch {
      // segue para a mensagem genérica
    }
  }
  return "Não consegui falar com o assistente. Confira a internet e tente de novo.";
}

export default function AssistenteClient() {
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [bolhas, setBolhas] = useState<Bolha[]>([]);
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [vozLigada, setVozLigada] = useState(true);
  const [ouvindo, setOuvindo] = useState(false);
  const [falando, setFalando] = useState(false);
  const [gastoMes, setGastoMes] = useState<number | null>(null);
  const [painel, setPainel] = useState(false);
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [memorias, setMemorias] = useState<Memoria[]>([]);
  const [temMicrofone, setTemMicrofone] = useState(false);
  const [temVoz, setTemVoz] = useState(false);
  const [cliente, setCliente] = useState<{ id: string; nome: string } | null>(null);
  const [escolhendoCliente, setEscolhendoCliente] = useState(false);
  const [listaClientes, setListaClientes] = useState<ClientOption[]>([]);
  const pararEscuta = useRef<(() => void) | null>(null);
  // Refs porque a escuta automática roda num callback de uma renderização antiga.
  const conversaRef = useRef<string | null>(null);
  const clienteRef = useRef<string | null>(null);
  const vozRef = useRef(true);
  const interrompido = useRef(false);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTemMicrofone(podeReconhecerFala());
    setTemVoz(podeFalar());
    try {
      if (localStorage.getItem(CHAVE_VOZ) === "0") {
        setVozLigada(false);
        vozRef.current = false;
      }
    } catch {
      // sem armazenamento: fica ligada
    }
    // Carrega as vozes do aparelho (o Chrome entrega depois do primeiro pedido).
    if (podeFalar()) window.speechSynthesis.getVoices();
    carregarGasto();
    // Vindo da ficha do cliente (?cliente=) ou de um texto compartilhado do WhatsApp (?texto=).
    const params = new URLSearchParams(window.location.search);
    const idCliente = params.get("cliente");
    if (idCliente) definirCliente(idCliente);
    const pergunta = params.get("pergunta");
    if (pergunta) setTexto(pergunta.slice(0, 500));
    const compartilhado = params.get("texto");
    if (compartilhado) {
      setTexto(`Recebi esta mensagem no WhatsApp:\n"${compartilhado.slice(0, 2000)}"\n\nMe ajude a responder.`);
    }
    if (idCliente || compartilhado || pergunta) window.history.replaceState(null, "", "/assistente");
    return () => {
      pararEscuta.current?.();
      pararDeFalar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bolhas, pensando]);

  async function definirCliente(id: string | null) {
    clienteRef.current = id;
    if (!id) {
      setCliente(null);
      return;
    }
    const { data } = await supabase.from("clients").select("id, name, display_name, treatment").eq("id", id).maybeSingle();
    setCliente(data ? { id: data.id, nome: nomeCurto(data) } : null);
    if (!data) clienteRef.current = null;
  }

  async function abrirEscolhaCliente() {
    setEscolhendoCliente(true);
    const { data } = await supabase.from("clients").select("id, name, city, whatsapp, parceiro").eq("is_test", false).order("name");
    setListaClientes((data as ClientOption[]) ?? []);
  }

  function escolherCliente(id: string) {
    setEscolhendoCliente(false);
    if (!id) return;
    // Trocar de cliente começa uma conversa nova, amarrada a ele.
    if (bolhas.length > 0) {
      pararTudo();
      setBolhas([]);
      setConversaId(null);
      conversaRef.current = null;
      setErro(null);
    }
    definirCliente(id);
  }

  async function carregarGasto() {
    const agora = new Date();
    const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
    const { data } = await supabase.from("assistente_uso").select("custo_usd").gte("created_at", inicio);
    if (data) setGastoMes(data.reduce((s, u) => s + Number(u.custo_usd), 0));
  }

  function alternarVoz() {
    const nova = !vozRef.current;
    setVozLigada(nova);
    vozRef.current = nova;
    if (!nova) {
      interrompido.current = true;
      pararDeFalar();
      setFalando(false);
    }
    try {
      localStorage.setItem(CHAVE_VOZ, nova ? "1" : "0");
    } catch {
      // sem armazenamento
    }
  }

  function ouvir() {
    if (ouvindo) {
      pararEscuta.current?.();
      return;
    }
    interrompido.current = true;
    pararDeFalar();
    setFalando(false);
    setErro(null);
    setOuvindo(true);
    pararEscuta.current = escutar(
      (parcial) => setTexto(parcial),
      (final, erroFala) => {
        setOuvindo(false);
        pararEscuta.current = null;
        if (final) enviar(final, true);
        else if (erroFala && erroFala !== "Não ouvi nada. Toque no microfone e fale de novo.") setErro(erroFala);
      }
    );
  }

  function pararTudo() {
    interrompido.current = true;
    pararEscuta.current?.();
    pararDeFalar();
    setFalando(false);
  }

  async function enviar(pergunta: string, porVoz = false) {
    const p = pergunta.trim();
    if (!p || pensando) return;
    setTexto("");
    setErro(null);
    setBolhas((b) => [...b, { papel: "eu", texto: p }]);
    setPensando(true);
    const { data, error } = await supabase.functions.invoke("assistente", {
      body: { mensagem: p, conversa_id: conversaRef.current, cliente_id: clienteRef.current },
    });
    setPensando(false);
    if (error || !data?.resposta) {
      setErro(error ? await mensagemDeErro(error) : "O assistente não respondeu. Tente de novo.");
      return;
    }
    setConversaId(data.conversa_id ?? null);
    conversaRef.current = data.conversa_id ?? null;
    if (typeof data.gasto_mes_usd === "number") setGastoMes(data.gasto_mes_usd);
    if (data.cliente_id && data.cliente_id !== clienteRef.current) definirCliente(data.cliente_id);
    const whatsapp: MensagemWhatsApp[] = Array.isArray(data.whatsapp) ? data.whatsapp : [];
    const planilhas: PlanilhaPedida[] = Array.isArray(data.planilhas) ? data.planilhas : [];
    const agendas: AgendaPedida[] = Array.isArray(data.agendas) ? data.agendas : [];
    setBolhas((b) => [
      ...b,
      {
        papel: "ia",
        texto: data.resposta,
        ...(whatsapp.length ? { whatsapp } : {}),
        ...(planilhas.length ? { planilhas } : {}),
        ...(agendas.length ? { agendas } : {}),
      },
    ]);

    if (vozRef.current && podeFalar()) {
      interrompido.current = false;
      setFalando(true);
      falar(data.resposta, () => {
        setFalando(false);
        // Pergunta feita por voz: depois de responder, já fica escutando a próxima.
        if (porVoz && !interrompido.current && podeReconhecerFala()) ouvir();
      });
    }
  }

  function novaConversa() {
    pararTudo();
    setBolhas([]);
    setConversaId(null);
    conversaRef.current = null;
    setErro(null);
    setPainel(false);
    definirCliente(null);
  }

  async function abrirPainel() {
    setPainel(true);
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase
        .from("assistente_conversas")
        .select("id, titulo, updated_at, client_id, clients(name, display_name, treatment)")
        .order("updated_at", { ascending: false })
        .limit(40),
      supabase
        .from("assistente_memoria")
        .select("id, texto, client_id, clients(name, display_name, treatment)")
        .order("created_at", { ascending: true }),
    ]);
    setConversas((c as Conversa[]) ?? []);
    setMemorias((m as Memoria[]) ?? []);
  }

  async function abrirConversa(id: string) {
    pararTudo();
    const { data } = await supabase.from("assistente_conversas").select("mensagens, client_id").eq("id", id).maybeSingle();
    setBolhas(bolhasDoHistorico((data?.mensagens as never) ?? []));
    definirCliente(data?.client_id ?? null);
    setConversaId(id);
    conversaRef.current = id;
    setErro(null);
    setPainel(false);
  }

  async function apagarConversa(id: string) {
    if (!confirm("Apagar esta conversa?")) return;
    await supabase.from("assistente_conversas").delete().eq("id", id);
    setConversas((c) => c.filter((x) => x.id !== id));
    if (id === conversaId) novaConversa();
  }

  async function apagarMemoria(id: string) {
    await supabase.from("assistente_memoria").delete().eq("id", id);
    setMemorias((m) => m.filter((x) => x.id !== id));
  }

  if (somenteLeitura) {
    return <p className="py-10 text-center text-sm text-neutral-500">O assistente não está disponível no modo visualização.</p>;
  }

  return (
    <div className="flex min-h-[calc(100dvh-11rem)] flex-col md:min-h-[calc(100dvh-4rem)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-neutral-900">
            <Sparkles size={20} className="text-brand-teal" /> Assistente
          </h1>
          {gastoMes !== null && (
            <p className="text-[11px] text-neutral-400">Gasto estimado este mês: US$ {gastoMes.toFixed(2)}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {temVoz && (
            <button
              onClick={alternarVoz}
              aria-label={vozLigada ? "Desligar resposta em voz" : "Ligar resposta em voz"}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-neutral-100 ${vozLigada ? "text-brand-teal-dark" : "text-neutral-400"}`}
            >
              {vozLigada ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          )}
          <button onClick={abrirPainel} aria-label="Conversas e memórias" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100">
            <History size={18} />
          </button>
          <button onClick={novaConversa} aria-label="Nova conversa" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100">
            <Plus size={18} />
          </button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        {cliente ? (
          <div className="flex items-center gap-1 rounded-full border border-brand-teal/30 bg-brand-teal/10 py-1 pl-3 pr-1 text-xs font-medium text-brand-teal-dark">
            <UserRound size={13} />
            <button onClick={abrirEscolhaCliente} className="max-w-[60vw] truncate">
              Sobre: {cliente.nome}
            </button>
            <button
              onClick={() => (bolhas.length ? novaConversa() : definirCliente(null))}
              aria-label="Tirar o cliente"
              className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-white/60"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={abrirEscolhaCliente}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs font-medium text-neutral-500 hover:border-brand-teal hover:text-brand-teal-dark"
          >
            <UserRound size={13} /> Sobre um cliente
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 pb-4">
        {bolhas.length === 0 && !pensando && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-sm text-neutral-700">
              Pergunte qualquer coisa sobre a Harmonize: agenda, clientes, quem deve, faturamento, tarefas, equipamentos. Pode
              escrever ou tocar no microfone e falar.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="rounded-full border border-brand-teal/30 bg-brand-teal/10 px-3 py-1.5 text-left text-xs font-medium text-brand-teal-dark transition hover:bg-brand-teal/20"
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-neutral-400">
              Para responder um cliente: cole a mensagem dele (ou compartilhe do WhatsApp para o Harmonize) e diga de quem é. Ele
              confere agenda, preços e histórico e deixa a resposta pronta para abrir no WhatsApp. Por enquanto ele não altera nada no
              app. Se ele entender algo errado, corrija: ele guarda o que você ensinar, inclusive sobre cada cliente.
            </p>
          </div>
        )}

        {bolhas.map((b, i) =>
          b.papel === "eu" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-gradient px-3.5 py-2.5 text-sm text-white">
                {b.texto}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[90%] rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm leading-relaxed text-neutral-800">
                {b.texto && <Texto texto={b.texto} />}
                {b.whatsapp && <BotoesWhatsApp lista={b.whatsapp} />}
                {b.planilhas && <BotoesPlanilha lista={b.planilhas} />}
                {b.agendas?.map((a, j) => <CartaoAgenda key={j} agenda={a} />)}
                {temVoz && (
                  <button
                    onClick={() => {
                      interrompido.current = true;
                      setFalando(true);
                      falar(b.texto, () => setFalando(false));
                    }}
                    className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-brand-teal-dark"
                  >
                    <Volume2 size={12} /> Ouvir
                  </button>
                )}
              </div>
            </div>
          )
        )}

        {pensando && (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-neutral-200 bg-white px-3.5 py-2.5 text-sm text-neutral-500">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-teal [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-teal [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-teal" />
              </span>
              Consultando o Harmonize...
            </div>
          </div>
        )}

        {erro && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        <div ref={fimRef} />
      </div>

      <div className="sticky bottom-24 z-10 md:bottom-4">
        {(ouvindo || falando) && (
          <div className="mb-2 flex justify-center">
            <button
              onClick={pararTudo}
              className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white shadow-lg"
            >
              <Square size={12} fill="currentColor" /> {ouvindo ? "Ouvindo... toque para parar" : "Falando... toque para parar"}
            </button>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(texto);
          }}
          className="flex items-end gap-2 rounded-2xl border border-neutral-200 bg-white p-2 shadow-lg"
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            rows={1}
            placeholder={ouvindo ? "Pode falar..." : "Pergunte ao assistente"}
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-sm text-neutral-800 outline-none placeholder:text-neutral-400"
          />
          {temMicrofone && (
            <button
              type="button"
              onClick={ouvir}
              disabled={pensando}
              aria-label={ouvindo ? "Parar de ouvir" : "Falar"}
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl transition disabled:opacity-40 ${
                ouvindo ? "animate-pulse bg-red-500 text-white" : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              <Mic size={18} />
            </button>
          )}
          <button
            type="submit"
            disabled={pensando || !texto.trim()}
            aria-label="Enviar"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white transition disabled:opacity-40"
          >
            <Send size={17} />
          </button>
        </form>
      </div>

      {escolhendoCliente && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setEscolhendoCliente(false)}>
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 pb-8 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-800">Conversar sobre qual cliente?</p>
              <button onClick={() => setEscolhendoCliente(false)} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                <X size={16} />
              </button>
            </div>
            <p className="mb-3 text-[11px] text-neutral-400">A conversa fica guardada com o cliente, e ele usa o que você já ensinou sobre ele.</p>
            <ClientPicker
              clients={listaClientes}
              value={cliente?.id ?? ""}
              onChange={escolherCliente}
              onClientCreated={() => {}}
              allowCreate={false}
            />
          </div>
        </div>
      )}

      {painel && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setPainel(false)}>
          <div
            className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-4 pb-8 shadow-2xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-800">Conversas</p>
              <button onClick={() => setPainel(false)} aria-label="Fechar" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100">
                <X size={16} />
              </button>
            </div>
            <button
              onClick={novaConversa}
              className="mb-2 flex w-full items-center gap-2 rounded-xl bg-brand-teal/10 px-3 py-2.5 text-sm font-medium text-brand-teal-dark"
            >
              <Plus size={16} /> Nova conversa
            </button>
            {conversas.length === 0 && <p className="px-1 py-2 text-sm text-neutral-400">Nenhuma conversa guardada ainda.</p>}
            <div className="space-y-1">
              {conversas.map((c) => (
                <div key={c.id} className={`flex items-center gap-1 rounded-xl ${c.id === conversaId ? "bg-neutral-100" : ""}`}>
                  <button onClick={() => abrirConversa(c.id)} className="min-w-0 flex-1 px-3 py-2 text-left">
                    <p className="truncate text-sm text-neutral-800">{c.titulo}</p>
                    {umDe(c.clients) && <p className="truncate text-[11px] font-medium text-brand-teal-dark">{nomeCurto(umDe(c.clients))}</p>}
                    <p className="text-[11px] text-neutral-400">
                      {new Date(c.updated_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </button>
                  <button onClick={() => apagarConversa(c.id)} aria-label="Apagar conversa" className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-400 hover:text-red-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <p className="mb-1 mt-5 text-sm font-semibold text-neutral-800">O que ele já sabe de você</p>
            <p className="mb-2 text-[11px] text-neutral-400">Coisas que você ensinou. Ele segue em toda conversa.</p>
            {memorias.length === 0 && <p className="px-1 py-1 text-sm text-neutral-400">Nada ainda. Exemplo: &quot;quando eu falar Luci, é a Dra. Luci Lima&quot;.</p>}
            <div className="space-y-1">
              {memorias.map((m) => (
                <div key={m.id} className="flex items-start gap-1 rounded-xl px-3 py-2 hover:bg-neutral-50">
                  <div className="flex-1">
                    {umDe(m.clients) && <p className="text-[11px] font-medium text-brand-teal-dark">{nomeCurto(umDe(m.clients))}</p>}
                    <p className="text-sm text-neutral-700">{m.texto}</p>
                  </div>
                  <button onClick={() => apagarMemoria(m.id)} aria-label="Esquecer" className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-neutral-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
