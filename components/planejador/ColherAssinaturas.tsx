"use client";

// Colher assinaturas da sessão (só o dono, no celular dele): tela cheia por
// portal no <body>. Passo 1 (antes de tudo, pedido do dono): triagem de
// contraindicações (absoluta só segue com a confirmação da profissional;
// relativa pede "avaliado e liberado"). Passo 2: resumo da sessão. Passo 3: termo de consentimento, que
// o paciente lê e marca "Li e concordo". Passo 4: o paciente assina com o dedo
// (nome já preenchido, dá para corrigir). Passo 5: a profissional (escolhida
// no cadastro da clínica: nome e registro vêm de lá) assina. Confirmar sobe as
// duas imagens para a pasta privada "assinaturas" e registra cada uma com o
// sha256 do resumo da sessão; a triagem e o termo vão junto da assinatura do
// paciente (fora do hash).

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, OctagonAlert, PenLine, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avisar } from "@/components/Dialogos";
import { type Plano } from "@/lib/planejador";
import { formatDate } from "@/lib/format";
import { hashDoResumo, resumoDaSessao } from "@/lib/assinatura-sessao";
import { enviarAssinatura } from "@/lib/assinaturas-envio";
import { ativas, faltaSql, profissionaisDaCliente, profissionalDoPlano, rotuloProfissional, type Profissional } from "@/lib/profissionais";
import { CONTRAINDICACOES, RESPOSTAS_VAZIAS, classificarTriagem, registroDaTriagem, type Contraindicacao, type RespostasTriagem } from "@/lib/triagem-hipro";
import { TERMO_PARAGRAFOS, TERMO_TITULO, TERMO_VERSAO } from "@/lib/consentimento-hipro";
import CanvasAssinatura, { type CanvasAssinaturaApi } from "./CanvasAssinatura";

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");
type Passo = "resumo" | "triagem" | "termo" | "paciente" | "profissional";
const PASSOS: Passo[] = ["triagem", "resumo", "termo", "paciente", "profissional"];

/** Caixinha grande, boa para o dedo. */
function Caixa({ marcada, onMudar, children, tom = "neutro" }: { marcada: boolean; onMudar: (v: boolean) => void; children: React.ReactNode; tom?: "neutro" | "absoluta" | "relativa" }) {
  const anel = marcada ? (tom === "absoluta" ? "ring-rose-300 bg-rose-50" : tom === "relativa" ? "ring-amber-300 bg-amber-50" : "ring-brand-teal/50 bg-brand-teal/5") : "ring-neutral-200 bg-white";
  return (
    <label className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ring-1 ${anel}`}>
      <input type="checkbox" checked={marcada} onChange={(e) => onMudar(e.target.checked)} className="mt-0.5 h-5 w-5 flex-shrink-0 accent-brand-teal" />
      <span className="min-w-0 text-sm text-neutral-800">{children}</span>
    </label>
  );
}

export default function ColherAssinaturas({
  planoId,
  plano,
  sessao,
  clienteId,
  onFechar,
  onConcluiu,
}: {
  planoId: string;
  plano: Plano;
  sessao: number;
  clienteId: string | null;
  onFechar: () => void;
  onConcluiu: () => void;
}) {
  const resumo = useMemo(() => resumoDaSessao(plano, sessao), [plano, sessao]);
  const [passo, setPasso] = useState<Passo>("triagem");
  const [nomePaciente, setNomePaciente] = useState(plano.paciente);
  const [blobPaciente, setBlobPaciente] = useState<Blob | null>(null);
  const [temPaciente, setTemPaciente] = useState(false);
  const [temProf, setTemProf] = useState(false);
  const [profissionais, setProfissionais] = useState<Profissional[] | null>(null);
  const [profId, setProfId] = useState("");
  const [nomeProf, setNomeProf] = useState(plano.profissional);
  const [registroProf, setRegistroProf] = useState(plano.profissionalRegistro);
  const [enviando, setEnviando] = useState(false);
  const [triagem, setTriagem] = useState<RespostasTriagem>(RESPOSTAS_VAZIAS);
  const [termoAceito, setTermoAceito] = useState(false);
  const classe = useMemo(() => classificarTriagem(triagem), [triagem]);
  const canvasPaciente = useRef<CanvasAssinaturaApi>(null);
  const canvasProf = useRef<CanvasAssinaturaApi>(null);

  useEffect(() => {
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = antes;
    };
  }, []);

  // Profissionais da clínica: a do planejamento já vem escolhida.
  useEffect(() => {
    if (!clienteId) {
      setProfissionais([]);
      return;
    }
    let vivo = true;
    createClient()
      .from("profissionais")
      .select("id, client_id, nome, registro, ativo")
      .eq("client_id", clienteId)
      .then(({ data, error }) => {
        if (!vivo) return;
        const lista = error ? [] : profissionaisDaCliente((data ?? []) as Profissional[], clienteId);
        setProfissionais(lista);
        if (error && !faltaSql(error)) return;
        const doPlano = profissionalDoPlano(lista, plano) ?? (ativas(lista).length === 1 ? ativas(lista)[0] : null);
        if (doPlano) {
          setProfId(doPlano.id);
          setNomeProf(doPlano.nome);
          setRegistroProf(doPlano.registro ?? "");
        }
      });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId]);

  function escolherProf(id: string) {
    setProfId(id);
    const p = profissionais?.find((x) => x.id === id);
    if (p) {
      setNomeProf(p.nome);
      setRegistroProf(p.registro ?? "");
    } else {
      setNomeProf("");
      setRegistroProf("");
    }
  }

  async function irParaProfissional() {
    if (!nomePaciente.trim()) return avisar("Escreva o nome do paciente.", "erro");
    const b = await canvasPaciente.current?.exportar();
    if (!b) return avisar("Falta a assinatura do paciente.", "erro");
    setBlobPaciente(b);
    setPasso("profissional");
  }

  async function confirmar() {
    if (!resumo || !blobPaciente) return;
    if (!classe.podeSeguir) return avisar(classe.falta ?? "Confira a triagem.", "erro");
    if (!termoAceito) return avisar("Falta o paciente marcar \"Li e concordo\" no termo.", "erro");
    if (!nomeProf.trim()) return avisar("Escolha ou escreva o nome da profissional.", "erro");
    const bProf = await canvasProf.current?.exportar();
    if (!bProf) return avisar("Falta a assinatura da profissional.", "erro");
    setEnviando(true);
    try {
      const hash = await hashDoResumo(resumo);
      const sb = createClient();
      const regTriagem = registroDaTriagem(triagem, termoAceito);
      await enviarAssinatura(sb, { planoId, sessao, papel: "paciente", nome: nomePaciente, imagem: blobPaciente, hash, resumo, triagem: regTriagem });
      await enviarAssinatura(sb, {
        planoId,
        sessao,
        papel: "profissional",
        nome: nomeProf,
        profissionalId: profId || null,
        registro: registroProf || null,
        imagem: bProf,
        hash,
        resumo,
      });
      avisar("Assinaturas guardadas.");
      onConcluiu();
      onFechar();
    } catch (e) {
      avisar((e as Error).message || "Não consegui guardar as assinaturas.", "erro");
    } finally {
      setEnviando(false);
    }
  }

  const entrada = "w-full rounded-xl bg-white px-3.5 py-3 text-[15px] text-neutral-900 ring-1 ring-neutral-200 outline-none focus:ring-2 focus:ring-brand-teal";
  const rotulo = "mb-1 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500";
  const ativasLista = profissionais ? ativas(profissionais) : [];
  const numeroPasso = PASSOS.indexOf(passo) + 1;
  const marcar = (id: string, v: boolean) => setTriagem((t) => ({ ...t, marcadas: { ...t.marcadas, [id]: v } }));
  const listaCondicoes = (tipo: Contraindicacao["tipo"]) =>
    CONTRAINDICACOES.filter((c) => c.tipo === tipo).map((c) => (
      <Caixa key={c.id} marcada={!!triagem.marcadas[c.id]} onMudar={(v) => marcar(c.id, v)} tom={tipo}>
        {c.texto}
        {c.detalhe && <span className="block text-xs text-neutral-500">{c.detalhe}</span>}
      </Caixa>
    ));

  return createPortal(
    <div className="fixed inset-0 z-[85] flex flex-col bg-[#F3F6F7]" role="dialog" aria-label="Colher assinaturas">
      <header className="bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(16,24,40,.06)]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-teal/10 text-brand-teal-dark">
            <PenLine size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold text-neutral-900">Assinaturas da Sessão {sessao}</p>
            <p className="truncate text-xs text-neutral-500">
              Passo {numeroPasso} de {PASSOS.length} · {plano.paciente || "paciente"}
            </p>
          </div>
          <button onClick={onFechar} aria-label="Fechar" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-600">
            <X size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto max-w-2xl space-y-3 px-4 pb-28 pt-4">
          <p className="flex items-start gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-xs text-sky-900 ring-1 ring-sky-200">
            <ShieldCheck size={15} className="mt-0.5 flex-shrink-0" /> Assinatura eletrônica simples: confirma que o paciente fez esta sessão.
          </p>

          {!resumo && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">Esta sessão não existe mais neste planejamento.</p>}

          {resumo && passo === "resumo" && (
            <section className="cartao space-y-3 p-4">
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                <span className="text-neutral-500">Paciente</span>
                <b className="text-right text-neutral-900">{resumo.paciente || "sem nome"}</b>
                <span className="text-neutral-500">Data</span>
                <b className="text-right text-neutral-900">{resumo.data ? formatDate(resumo.data) : "sem data"}</b>
                <span className="text-neutral-500">Sessão</span>
                <b className="text-right text-neutral-900">
                  {resumo.sessao} de {resumo.sessoes}
                </b>
                {resumo.procedimento && (
                  <>
                    <span className="text-neutral-500">Procedimento</span>
                    <b className="text-right text-neutral-900">{resumo.procedimento}</b>
                  </>
                )}
              </div>
              <ul className="divide-y divide-neutral-100 rounded-xl ring-1 ring-neutral-200">
                {resumo.areas.length === 0 && <li className="p-3 text-center text-sm text-neutral-500">Nenhuma área com disparos.</li>}
                {resumo.areas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-neutral-800">{a.nome}</span>
                    <b className="tabular-nums text-brand-teal-dark">{fmt(a.total)}</b>
                  </li>
                ))}
              </ul>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Nesta sessão</p>
                  <p className="text-xl font-black tabular-nums text-neutral-900">{fmt(resumo.total)}</p>
                </div>
                <div className="rounded-2xl bg-neutral-50 p-3 ring-1 ring-neutral-200">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">{resumo.sessao < resumo.sessoes ? `Fica para a Sessão ${resumo.sessao + 1}` : "Restante"}</p>
                  <p className="text-xl font-black tabular-nums text-brand-teal-dark">{fmt(resumo.saldo)}</p>
                </div>
              </div>
            </section>
          )}

          {resumo && passo === "triagem" && (
            <section className="cartao space-y-3 p-4">
              <div>
                <p className="text-sm font-bold text-neutral-900">Triagem de contraindicações</p>
                <p className="text-xs text-neutral-500">Pergunte ao paciente e marque o que ele tiver. Nada marcado = sem contraindicações declaradas.</p>
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">Absolutas</p>
              <div className="space-y-1.5">{listaCondicoes("absoluta")}</div>
              <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">Relativas</p>
              <div className="space-y-1.5">{listaCondicoes("relativa")}</div>
              <p className="pt-1 text-[11px] font-bold uppercase tracking-wider text-neutral-500">Antes de começar</p>
              <Caixa marcada={triagem.disparoTeste} onMudar={(v) => setTriagem((t) => ({ ...t, disparoTeste: v }))}>
                Disparo teste realizado
              </Caixa>

              {classe.situacao === "absoluta" && (
                <div className="space-y-2 rounded-2xl bg-rose-50 p-3 ring-2 ring-rose-300">
                  <p className="flex items-start gap-2 text-sm font-bold text-rose-800">
                    <OctagonAlert size={18} className="mt-0.5 flex-shrink-0" /> Contraindicação absoluta: o procedimento não deve ser feito.
                  </p>
                  <p className="text-xs text-rose-800">{classe.absolutas.map((c) => c.texto).join("; ")}.</p>
                  <Caixa marcada={triagem.absolutaConfirmada} onMudar={(v) => setTriagem((t) => ({ ...t, absolutaConfirmada: v }))} tom="absoluta">
                    <b>A profissional avaliou e decidiu prosseguir mesmo assim.</b> Fica registrado junto da assinatura.
                  </Caixa>
                </div>
              )}
              {classe.situacao === "relativa" && (
                <div className="space-y-2 rounded-2xl bg-amber-50 p-3 ring-1 ring-amber-300">
                  <p className="flex items-start gap-2 text-sm font-bold text-amber-900">
                    <TriangleAlert size={17} className="mt-0.5 flex-shrink-0" /> Contraindicação relativa: {classe.relativas.map((c) => c.texto.toLowerCase()).join("; ")}.
                  </p>
                  <Caixa marcada={triagem.relativaLiberada} onMudar={(v) => setTriagem((t) => ({ ...t, relativaLiberada: v }))} tom="relativa">
                    Avaliado e liberado pela profissional
                  </Caixa>
                </div>
              )}
              {classe.situacao === "sem" && (
                <p className="flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  <ShieldCheck size={16} /> Sem contraindicações declaradas
                </p>
              )}
              {!triagem.disparoTeste && <p className="text-xs text-amber-700">O disparo teste ainda não foi marcado.</p>}
            </section>
          )}

          {resumo && passo === "termo" && (
            <section className="cartao space-y-3 p-4">
              <p className="text-sm font-bold text-neutral-900">{TERMO_TITULO}</p>
              <p className="text-xs text-neutral-500">Entregue o celular ao paciente para ler.</p>
              <div className="space-y-2.5 rounded-xl bg-neutral-50 p-3 text-[14px] leading-relaxed text-neutral-800 ring-1 ring-neutral-200">
                {TERMO_PARAGRAFOS.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
              </div>
              <Caixa marcada={termoAceito} onMudar={setTermoAceito}>
                <b>Li e concordo</b> ({nomePaciente.trim() || "paciente"})
              </Caixa>
              <p className="text-[11px] text-neutral-400">Versão do termo: {TERMO_VERSAO}</p>
            </section>
          )}

          {resumo && passo === "paciente" && (
            <section className="cartao space-y-3 p-4">
              <p className="text-sm font-bold text-neutral-900">Assinatura do paciente</p>
              <label className="block">
                <span className={rotulo}>Nome do paciente</span>
                <input value={nomePaciente} onChange={(e) => setNomePaciente(e.target.value)} className={entrada} autoComplete="off" />
              </label>
              <CanvasAssinatura ref={canvasPaciente} rotulo="Assinatura do paciente" onMudou={setTemPaciente} />
            </section>
          )}

          {resumo && passo === "profissional" && (
            <section className="cartao space-y-3 p-4">
              <p className="text-sm font-bold text-neutral-900">Assinatura da profissional</p>
              {profissionais === null ? (
                <p className="flex items-center gap-2 text-xs text-neutral-500">
                  <Loader2 size={13} className="animate-spin" /> Carregando as profissionais...
                </p>
              ) : ativasLista.length > 0 ? (
                <label className="block">
                  <span className={rotulo}>Profissional</span>
                  <select value={profId} onChange={(e) => escolherProf(e.target.value)} className={entrada}>
                    <option value="">Outra (escrever o nome)</option>
                    {ativasLista.map((p) => (
                      <option key={p.id} value={p.id}>
                        {rotuloProfissional(p)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {!profId && (
                <div className="grid grid-cols-[1fr_130px] gap-2">
                  <label className="block min-w-0">
                    <span className={rotulo}>Nome</span>
                    <input value={nomeProf} onChange={(e) => setNomeProf(e.target.value)} className={entrada} autoComplete="off" />
                  </label>
                  <label className="block min-w-0">
                    <span className={rotulo}>Registro</span>
                    <input value={registroProf} onChange={(e) => setRegistroProf(e.target.value)} placeholder="CRBM 1234" className={entrada} autoComplete="off" />
                  </label>
                </div>
              )}
              {profId && <p className="text-xs text-neutral-500">{rotuloProfissional({ nome: nomeProf, registro: registroProf })}</p>}
              <CanvasAssinatura ref={canvasProf} rotulo="Assinatura da profissional" onMudou={setTemProf} />
            </section>
          )}
        </div>
      </div>

      {resumo && (
        <div className="border-t border-neutral-200/70 bg-white px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto flex max-w-2xl gap-2">
            {passo !== "triagem" && (
              <button
                type="button"
                onClick={() => setPasso(PASSOS[Math.max(0, PASSOS.indexOf(passo) - 1)])}
                disabled={enviando}
                className="flex items-center justify-center gap-1.5 rounded-2xl bg-white px-4 py-3.5 text-sm font-bold text-neutral-700 ring-1 ring-neutral-200"
              >
                <ArrowLeft size={16} /> Voltar
              </button>
            )}
            {passo === "triagem" && (
              <button
                type="button"
                onClick={() => (classe.podeSeguir ? setPasso("resumo") : avisar(classe.falta ?? "Confira a triagem.", "erro"))}
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold text-white ${classe.podeSeguir ? "bg-brand-gradient shadow-glow-teal" : "bg-neutral-300"}`}
              >
                Próximo: resumo da sessão <ArrowRight size={17} />
              </button>
            )}
            {passo === "resumo" && (
              <button type="button" onClick={() => setPasso("termo")} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal">
                Conferido, próximo: termo <ArrowRight size={17} />
              </button>
            )}
            {passo === "termo" && (
              <button type="button" onClick={() => setPasso("paciente")} disabled={!termoAceito} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal disabled:opacity-50">
                Assinar <ArrowRight size={17} />
              </button>
            )}
            {passo === "paciente" && (
              <button type="button" onClick={irParaProfissional} disabled={!temPaciente} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal disabled:opacity-50">
                Próximo: profissional <ArrowRight size={17} />
              </button>
            )}
            {passo === "profissional" && (
              <button type="button" onClick={confirmar} disabled={!temProf || enviando} className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-gradient py-3.5 text-sm font-bold text-white shadow-glow-teal disabled:opacity-50">
                {enviando ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />} Confirmar
              </button>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
