"use client";

// Anotações da cliente: cada uma é um item curto com data e hora (tabela
// cliente_anotacoes), falado pelo microfone ou digitado. Não há edição: errou,
// apaga e anota de novo, para o histórico ficar fiel. O assistente lê tudo isso
// pelo dossiê da cliente (dossie_cliente).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bot, Keyboard, Loader2, Megaphone, Mic, Send, Square, StickyNote, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ROTULO_ORIGEM_ANOTACAO, origemDaAnotacao, type OrigemAnotacao } from "@/lib/anotacoes";
import { escutar, podeReconhecerFala } from "@/lib/reconhecer-fala";
import { avisar, confirmar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

interface Anotacao {
  id: string;
  texto: string;
  origem: OrigemAnotacao;
  created_at: string;
}

// As de campanha nascem sozinhas no banco ao marcar o envio (e o que veio
// depois: respondeu, agendou, não quer, desfeito); apagam-se como as outras.
const ICONE_ORIGEM: Record<OrigemAnotacao, typeof Mic> = {
  digitada: Keyboard,
  voz: Mic,
  assistente: Bot,
  campanha: Megaphone,
};

function quando(iso: string) {
  const d = new Date(iso);
  return format(d, "EEE, dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export default function AnotacoesCliente({
  clienteId,
  nome,
  onClose,
}: {
  clienteId: string;
  nome?: string | null;
  onClose: () => void;
}) {
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [lista, setLista] = useState<Anotacao[] | null>(null);
  const [obsCadastro, setObsCadastro] = useState<string | null>(null);
  const [nomeCliente, setNomeCliente] = useState(nome ?? "");
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [porVoz, setPorVoz] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState<string | null>(null);
  const [temMicrofone, setTemMicrofone] = useState(false);
  const parar = useRef<(() => void) | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    const [{ data, error }, { data: cli }] = await Promise.all([
      supabase
        .from("cliente_anotacoes")
        .select("id, texto, origem, created_at")
        .eq("client_id", clienteId)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("clients").select("name, notes").eq("id", clienteId).maybeSingle(),
    ]);
    if (error) {
      setErroCarga("Não consegui carregar as anotações. Confira a internet e abra de novo.");
      setLista([]);
      return;
    }
    setErroCarga(null);
    setLista((data ?? []) as Anotacao[]);
    if (cli) {
      setObsCadastro(((cli.notes as string | null) ?? "").trim() || null);
      if (!nome) setNomeCliente((cli.name as string) ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  useEffect(() => {
    setTemMicrofone(podeReconhecerFala());
    carregar();
  }, [carregar]);

  // Esc fecha; trava a rolagem da tela de trás.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    document.addEventListener("keydown", tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", tecla);
      document.body.style.overflow = antes;
      parar.current?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function fechar() {
    parar.current?.();
    onClose();
  }

  function falar() {
    if (ouvindo) {
      parar.current?.();
      return;
    }
    setOuvindo(true);
    setParcial("");
    parar.current = escutar(
      (p) => setParcial(p),
      (final, erro) => {
        setOuvindo(false);
        setParcial("");
        parar.current = null;
        if (final) {
          setTexto((t) => (t.trim() ? `${t.trim()} ${final}` : final));
          setPorVoz(true);
          requestAnimationFrame(() => campo.current?.focus());
        } else if (erro) {
          avisar(erro, "erro");
        }
      }
    );
  }

  async function salvar() {
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    const { error } = await supabase.rpc("salvar_anotacao_cliente", {
      p_client_id: clienteId,
      p_texto: t,
      p_origem: porVoz ? "voz" : "digitada",
    });
    setSalvando(false);
    if (error) {
      avisar(error.message || "Não consegui salvar a anotação.", "erro");
      return;
    }
    setTexto("");
    setPorVoz(false);
    await carregar();
  }

  async function apagar(a: Anotacao) {
    const ok = await confirmar({
      titulo: "Apagar anotação?",
      texto: `"${a.texto.length > 120 ? a.texto.slice(0, 120) + "..." : a.texto}"`,
      confirmar: "Apagar",
      perigo: true,
    });
    if (!ok) return;
    setApagando(a.id);
    const { error } = await supabase.rpc("excluir_anotacao_cliente", { p_id: a.id });
    setApagando(null);
    if (error) {
      avisar(error.message || "Não consegui apagar.", "erro");
      return;
    }
    setLista((l) => (l ?? []).filter((x) => x.id !== a.id));
  }

  const conteudo = (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={(e) => {
        e.stopPropagation();
        fechar();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Anotações de ${nomeCliente || "cliente"}`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl animate-[subir_.22s_ease-out] sm:rounded-3xl"
      >
        <div className="flex items-center gap-3 border-b border-neutral-100 px-4 pb-3 pt-4">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <StickyNote size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Anotações</p>
            <p className="truncate text-base font-bold text-neutral-900">{nomeCliente || "Cliente"}</p>
          </div>
          <button
            type="button"
            onClick={fechar}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-500"
            aria-label="Fechar anotações"
          >
            <X size={17} />
          </button>
        </div>

        {!somenteLeitura && (
          <div className="border-b border-neutral-100 px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={campo}
                value={ouvindo && parcial ? `${texto ? texto + " " : ""}${parcial}` : texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) salvar();
                }}
                rows={2}
                maxLength={2000}
                placeholder={temMicrofone ? "Fale no microfone ou digite uma anotação" : "Digite uma anotação"}
                className="min-h-[52px] flex-1 resize-none rounded-2xl border border-neutral-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-teal"
              />
              {temMicrofone && (
                <button
                  type="button"
                  onClick={falar}
                  aria-label={ouvindo ? "Parar de ouvir" : "Falar a anotação"}
                  className={`flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-2xl ${
                    ouvindo ? "animate-pulse bg-rose-500 text-white" : "bg-teal-50 text-teal-700"
                  }`}
                >
                  {ouvindo ? <Square size={18} /> : <Mic size={20} />}
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[11px] text-neutral-400">
                {ouvindo ? "Ouvindo... fale e espere um instante." : "Fica salva com a data e a hora de agora."}
              </p>
              <button
                type="button"
                onClick={salvar}
                disabled={!texto.trim() || salvando || ouvindo}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-brand-teal px-4 text-sm font-semibold text-white disabled:opacity-40"
              >
                {salvando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                Salvar
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {lista === null ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-neutral-400">
              <Loader2 size={15} className="animate-spin" /> Carregando...
            </p>
          ) : (
            <>
              {erroCarga && <p className="mb-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{erroCarga}</p>}
              {lista.length === 0 && !erroCarga && (
                <p className="py-6 text-center text-sm text-neutral-400">Nenhuma anotação ainda.</p>
              )}
              <ol className="space-y-2.5">
                {lista.map((a) => {
                  const origem = origemDaAnotacao(a.origem);
                  const o = { texto: ROTULO_ORIGEM_ANOTACAO[origem], icone: ICONE_ORIGEM[origem] };
                  return (
                    <li key={a.id} className="rounded-2xl border border-neutral-100 bg-neutral-50/70 p-3">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[11px] font-semibold capitalize text-neutral-500">
                            <o.icone size={12} className="flex-shrink-0" />
                            {quando(a.created_at)}
                            <span className="font-normal normal-case text-neutral-400">· {o.texto}</span>
                          </p>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-800">{a.texto}</p>
                        </div>
                        {!somenteLeitura && (
                          <button
                            type="button"
                            onClick={() => apagar(a)}
                            disabled={apagando === a.id}
                            aria-label="Apagar anotação"
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-neutral-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                          >
                            {apagando === a.id ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {obsCadastro && (
                <div className="mt-3 rounded-2xl border border-dashed border-neutral-200 p-3">
                  <p className="text-[11px] font-semibold text-neutral-500">Observações do cadastro</p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-700">{obsCadastro}</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(conteudo, document.body);
}
