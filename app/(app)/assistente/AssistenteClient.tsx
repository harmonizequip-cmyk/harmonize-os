"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { escutar, podeReconhecerFala } from "@/lib/reconhecer-fala";
import { falar, pararDeFalar, podeFalar } from "@/lib/falar";
import { bolhasDoHistorico, trechosMarkdown, type Bolha } from "@/lib/assistente";
import { History, Mic, Plus, Send, Sparkles, Square, Trash2, Volume2, VolumeX, X } from "lucide-react";

const CHAVE_VOZ = "harmonize-assistente-voz";

const SUGESTOES = [
  "Quem está me devendo e há quanto tempo?",
  "Como está o faturamento deste mês comparado ao mês passado?",
  "Tenho dia livre na semana que vem?",
  "Quais tarefas estão atrasadas?",
];

type Conversa = { id: string; titulo: string; updated_at: string };
type Memoria = { id: string; texto: string };

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
  const pararEscuta = useRef<(() => void) | null>(null);
  // Refs porque a escuta automática roda num callback de uma renderização antiga.
  const conversaRef = useRef<string | null>(null);
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
    return () => {
      pararEscuta.current?.();
      pararDeFalar();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bolhas, pensando]);

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
      body: { mensagem: p, conversa_id: conversaRef.current },
    });
    setPensando(false);
    if (error || !data?.resposta) {
      setErro(error ? await mensagemDeErro(error) : "O assistente não respondeu. Tente de novo.");
      return;
    }
    setConversaId(data.conversa_id ?? null);
    conversaRef.current = data.conversa_id ?? null;
    if (typeof data.gasto_mes_usd === "number") setGastoMes(data.gasto_mes_usd);
    setBolhas((b) => [...b, { papel: "ia", texto: data.resposta }]);

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
  }

  async function abrirPainel() {
    setPainel(true);
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("assistente_conversas").select("id, titulo, updated_at").order("updated_at", { ascending: false }).limit(40),
      supabase.from("assistente_memoria").select("id, texto").order("created_at", { ascending: true }),
    ]);
    setConversas((c as Conversa[]) ?? []);
    setMemorias((m as Memoria[]) ?? []);
  }

  async function abrirConversa(id: string) {
    pararTudo();
    const { data } = await supabase.from("assistente_conversas").select("mensagens").eq("id", id).maybeSingle();
    setBolhas(bolhasDoHistorico((data?.mensagens as never) ?? []));
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
              Por enquanto ele só consulta, não altera nada. Se ele entender algo errado, corrija: ele guarda o que você ensinar.
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
                <Texto texto={b.texto} />
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
                  <p className="flex-1 text-sm text-neutral-700">{m.texto}</p>
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
