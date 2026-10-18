"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { mensagemDeErro } from "../assistente/mensagem-erro";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { CATEGORIAS_INSIGHT, categoriaInfo, ordenarInsights, perguntaParaAprofundar, type Insight } from "@/lib/insights";
import { Archive, Brain, Check, ChevronDown, ChevronUp, Copy, Sparkles, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";

const FRASES_ESPERA = [
  "Lendo o funil e os leads parados...",
  "Olhando quem alugava e sumiu...",
  "Cruzando ticket, disparos e faixas de preço...",
  "Conferindo lucro por cliente e por cidade...",
  "Procurando dias vazios e rotas na agenda...",
  "Separando o que mais mexe no caixa...",
  "Escrevendo os próximos passos...",
];

function CartaoInsight({
  insight,
  nomes,
  onMudar,
  somenteLeitura,
}: {
  insight: Insight;
  nomes: Map<string, string>;
  onMudar: (id: string, campos: Partial<Insight>) => void;
  somenteLeitura: boolean;
}) {
  const cat = categoriaInfo(insight.categoria);
  const [aberto, setAberto] = useState(insight.status === "novo");
  const [copiado, setCopiado] = useState(false);
  const apagado = insight.status !== "novo";

  async function copiarAcao() {
    if (!insight.acao) return;
    try {
      await navigator.clipboard.writeText(insight.acao);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      // sem permissão de copiar
    }
  }

  return (
    <div className={`rounded-2xl border bg-white p-4 shadow-sm ${apagado ? "opacity-60" : ""}`}>
      <button onClick={() => setAberto((v) => !v)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cat.cor}`}>
              {cat.emoji} {cat.rotulo}
            </span>
            <span className="text-[11px]" title="Impacto">
              {"🔥".repeat(Math.max(1, Math.min(3, insight.impacto)))}
            </span>
            {insight.status === "feito" && <span className="text-[11px] font-medium text-emerald-700">✓ feito</span>}
            {insight.status === "arquivado" && <span className="text-[11px] text-neutral-500">arquivado</span>}
          </div>
          <p className="text-[15px] font-semibold leading-snug text-neutral-900">{insight.titulo}</p>
        </div>
        {aberto ? <ChevronUp size={18} className="mt-1 flex-shrink-0 text-neutral-400" /> : <ChevronDown size={18} className="mt-1 flex-shrink-0 text-neutral-400" />}
      </button>

      {aberto && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-700">{insight.texto}</p>

          {insight.acao && (
            <div className="rounded-xl border border-brand-teal/30 bg-brand-teal/10 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-teal-dark">Próximo passo</p>
                <button onClick={copiarAcao} className="flex items-center gap-1 text-[11px] font-medium text-brand-teal-dark">
                  <Copy size={12} /> {copiado ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{insight.acao}</p>
            </div>
          )}

          {insight.evidencia && <p className="text-xs leading-relaxed text-neutral-500">📊 {insight.evidencia}</p>}

          {insight.client_ids.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {insight.client_ids.map((id) => (
                <Link
                  key={id}
                  href={`/clientes/${id}`}
                  className="rounded-full border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700"
                >
                  {nomes.get(id) ?? "Cliente"}
                </Link>
              ))}
            </div>
          )}

          <Link
            href={`/assistente?auto=1&pergunta=${encodeURIComponent(perguntaParaAprofundar(insight))}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white"
          >
            <Sparkles size={15} /> Colocar em prática com o assistente
          </Link>

          {!somenteLeitura && (
            <div className="flex items-center justify-between gap-2 border-t border-neutral-100 pt-3">
              <div className="flex gap-1.5">
                <button
                  onClick={() => onMudar(insight.id, { util: insight.util === true ? null : true })}
                  className={`rounded-lg border px-2.5 py-1.5 ${insight.util === true ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-neutral-200 text-neutral-500"}`}
                  aria-label="Útil"
                >
                  <ThumbsUp size={15} />
                </button>
                <button
                  onClick={() => onMudar(insight.id, { util: insight.util === false ? null : false })}
                  className={`rounded-lg border px-2.5 py-1.5 ${insight.util === false ? "border-rose-300 bg-rose-50 text-rose-700" : "border-neutral-200 text-neutral-500"}`}
                  aria-label="Não útil"
                >
                  <ThumbsDown size={15} />
                </button>
              </div>
              {insight.status === "novo" ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => onMudar(insight.id, { status: "arquivado" })}
                    className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600"
                  >
                    <Archive size={13} /> Arquivar
                  </button>
                  <button
                    onClick={() => onMudar(insight.id, { status: "feito" })}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    <Check size={13} /> Fiz
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onMudar(insight.id, { status: "novo" })}
                  className="flex items-center gap-1 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-600"
                >
                  <Undo2 size={13} /> Voltar para a lista
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InsightsClient() {
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [insights, setInsights] = useState<Insight[] | null>(null);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [filtro, setFiltro] = useState<string>("todos");
  const [foco, setFoco] = useState<string>("tudo");
  const [gerando, setGerando] = useState(false);
  const [frase, setFrase] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [verFeitos, setVerFeitos] = useState(false);

  async function carregar() {
    const { data, error } = await supabase
      .from("insights")
      .select("id, categoria, titulo, texto, acao, evidencia, impacto, client_ids, status, util, created_at")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) {
      setErro("Não consegui abrir os insights.");
      setInsights([]);
      return;
    }
    const lista = (data ?? []) as Insight[];
    setInsights(lista);
    const ids = Array.from(new Set(lista.flatMap((i) => i.client_ids ?? [])));
    if (ids.length) {
      const { data: cs } = await supabase.from("clients").select("id, name, display_name, treatment").in("id", ids);
      setNomes(new Map((cs ?? []).map((c) => [c.id, [c.treatment, c.display_name || c.name].filter(Boolean).join(" ")])));
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!gerando) return;
    const t = setInterval(() => setFrase((f) => (f + 1) % FRASES_ESPERA.length), 4000);
    return () => clearInterval(t);
  }, [gerando]);

  async function gerar() {
    setGerando(true);
    setErro(null);
    setAviso(null);
    setFrase(0);
    const { data, error } = await supabase.functions.invoke("assistente", {
      body: { modo: "insights", foco: foco === "tudo" ? null : foco },
    });
    setGerando(false);
    if (error) {
      setErro(await mensagemDeErro(error, "Não consegui gerar agora. Confira a internet e tente de novo."));
      return;
    }
    const n = Number(data?.insights_criados ?? 0);
    setAviso(n ? `${n} insights novos. ${data?.resposta ?? ""}` : data?.resposta || "Nenhum insight novo desta vez.");
    setFiltro("todos");
    await carregar();
  }

  async function mudar(id: string, campos: Partial<Insight>) {
    setInsights((l) => (l ?? []).map((i) => (i.id === id ? { ...i, ...campos } : i)));
    const extra = campos.status ? { resolvido_em: campos.status === "novo" ? null : new Date().toISOString() } : {};
    const { error } = await supabase.from("insights").update({ ...campos, ...extra }).eq("id", id);
    if (error) {
      setErro("Não consegui salvar. Tente de novo.");
      carregar();
    }
  }

  const ordenados = useMemo(() => ordenarInsights(insights ?? []), [insights]);
  const filtrados = ordenados.filter((i) => filtro === "todos" || i.categoria === filtro);
  const novos = filtrados.filter((i) => i.status === "novo");
  const resolvidos = filtrados.filter((i) => i.status !== "novo");
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of insights ?? []) if (i.status === "novo") m.set(i.categoria, (m.get(i.categoria) ?? 0) + 1);
    return m;
  }, [insights]);
  const totalNovos = Array.from(contagem.values()).reduce((s, n) => s + n, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-28">
      <div className="rounded-2xl bg-brand-gradient p-5 text-white shadow-sm">
        <div className="flex items-center gap-2">
          <Brain size={22} />
          <h1 className="text-xl font-bold">Cérebro</h1>
        </div>
        <p className="mt-1 text-sm text-white/90">
          Ideias para a Harmonize crescer, tiradas dos seus números e do que funciona no mercado. Cada uma vem com o próximo passo.
        </p>
        {!somenteLeitura && (
          <div className="mt-4 space-y-2">
            <select
              value={foco}
              onChange={(e) => setFoco(e.target.value)}
              disabled={gerando}
              className="w-full rounded-xl border-0 bg-white/20 px-3 py-2 text-sm text-white [&>option]:text-neutral-900"
            >
              <option value="tudo">Olhar tudo</option>
              {CATEGORIAS_INSIGHT.map((c) => (
                <option key={c.id} value={c.id}>
                  Foco em {c.rotulo.toLowerCase()}
                </option>
              ))}
            </select>
            <button
              onClick={gerar}
              disabled={gerando}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-brand-teal-dark disabled:opacity-80"
            >
              <Sparkles size={16} className={gerando ? "animate-pulse" : ""} />
              {gerando ? FRASES_ESPERA[frase] : "Gerar novos insights"}
            </button>
            {gerando && <p className="text-center text-xs text-white/80">Leva perto de um minuto. Pode deixar a tela aberta.</p>}
          </div>
        )}
      </div>

      {erro && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
      {aviso && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}

      {insights && insights.length > 0 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          <button
            onClick={() => setFiltro("todos")}
            className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${filtro === "todos" ? "border-brand-teal bg-brand-teal text-white" : "border-neutral-200 bg-white text-neutral-600"}`}
          >
            Todos {totalNovos ? `(${totalNovos})` : ""}
          </button>
          {CATEGORIAS_INSIGHT.map((c) => (
            <button
              key={c.id}
              onClick={() => setFiltro(c.id)}
              className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${filtro === c.id ? "border-brand-teal bg-brand-teal text-white" : "border-neutral-200 bg-white text-neutral-600"}`}
            >
              {c.emoji} {c.rotulo} {contagem.get(c.id) ? `(${contagem.get(c.id)})` : ""}
            </button>
          ))}
        </div>
      )}

      {insights === null && <p className="py-10 text-center text-sm text-neutral-400">Carregando...</p>}

      {insights && insights.length === 0 && !gerando && (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-6 text-center">
          <p className="text-3xl">🧠</p>
          <p className="mt-2 text-sm font-medium text-neutral-800">Nenhum insight ainda</p>
          <p className="mt-1 text-sm text-neutral-500">Toque em "Gerar novos insights" para a primeira rodada.</p>
        </div>
      )}

      <div className="space-y-3">
        {novos.map((i) => (
          <CartaoInsight key={i.id} insight={i} nomes={nomes} onMudar={mudar} somenteLeitura={somenteLeitura} />
        ))}
      </div>

      {insights && insights.length > 0 && novos.length === 0 && (
        <p className="py-4 text-center text-sm text-neutral-500">Nada pendente aqui. Gere uma rodada nova quando quiser.</p>
      )}

      {resolvidos.length > 0 && (
        <div>
          <button onClick={() => setVerFeitos((v) => !v)} className="flex w-full items-center justify-center gap-1 py-2 text-xs font-medium text-neutral-500">
            {verFeitos ? "Esconder" : "Ver"} feitos e arquivados ({resolvidos.length}) {verFeitos ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {verFeitos && (
            <div className="mt-2 space-y-3">
              {resolvidos.map((i) => (
                <CartaoInsight key={i.id} insight={i} nomes={nomes} onMudar={mudar} somenteLeitura={somenteLeitura} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
