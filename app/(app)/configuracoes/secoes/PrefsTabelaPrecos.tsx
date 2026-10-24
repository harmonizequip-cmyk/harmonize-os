"use client";

// Tabela de preços (arte): estimativas de disparos por procedimento, a linha
// em destaque, as "Informações importantes" e a nota. Os preços da arte vêm de
// Preços; aqui ficam só os textos e as estimativas.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { DEFAULT_PREFERENCIAS, LIMITES_TEXTO, type Preferencias } from "@/lib/preferencias";
import { BarraSalvar, Bloco, CampoTexto, numero } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.tabelaPrecos;
const L = LIMITES_TEXTO;
const entrada =
  "h-11 w-full min-w-0 rounded-xl border border-neutral-300 bg-white px-3 text-sm text-neutral-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20";
const botaoIcone =
  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white text-rose-600 ring-1 ring-neutral-200 active:bg-neutral-100";
const botaoVoltar = "mt-3 flex min-h-11 items-center gap-1.5 text-xs font-medium text-neutral-500 active:text-neutral-800";
const botaoAdd = "mt-3 flex min-h-11 items-center gap-1 rounded-xl px-3 text-xs font-bold text-brand-teal-dark ring-1 ring-brand-teal disabled:opacity-40";

type Linha = { procedimento: string; disparos: string };
const paraLinha = (e: { procedimento: string; disparos: number }): Linha => ({
  procedimento: e.procedimento,
  disparos: e.disparos > 0 ? String(e.disparos) : "",
});

function estado(tp: Preferencias["tabelaPrecos"]) {
  return {
    estimativas: tp.estimativas.map(paraLinha),
    destaque: paraLinha(tp.destaque),
    infos: [...tp.infos],
    nota: tp.nota,
  };
}
type Estado = ReturnType<typeof estado>;

const milhar = (n: number) => n.toLocaleString("pt-BR");

export default function PrefsTabelaPrecos({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => estado(preferencias.tabelaPrecos), [preferencias]);
  const [e, setE] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  function muda(f: (x: Estado) => Estado) {
    setE(f);
    setErro(null);
    setSalvo(false);
  }
  const soDigitos = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  async function salvar() {
    const estimativas = e.estimativas
      .map((l) => ({ procedimento: l.procedimento.trim(), disparos: Math.round(numero(l.disparos)) }))
      .filter((l) => l.procedimento || l.disparos);
    if (estimativas.length === 0) return setErro("Deixe pelo menos uma estimativa.");
    const ruim = estimativas.find((l) => !l.procedimento || !(l.disparos >= 10 && l.disparos <= 200000));
    if (ruim) return setErro("Toda estimativa precisa de nome e de 10 a 200.000 disparos.");
    const destProc = e.destaque.procedimento.trim();
    const destDisp = Math.round(numero(e.destaque.disparos));
    if (destProc && !(destDisp >= 10 && destDisp <= 200000)) return setErro("A linha em destaque precisa de 10 a 200.000 disparos.");
    const infos = e.infos.map((t) => t.trim()).filter(Boolean);
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), {
      tabelaPrecos: {
        estimativas,
        destaque: destProc ? { procedimento: destProc, disparos: destDisp } : { procedimento: "", disparos: 0 },
        infos,
        nota: e.nota.trim(),
      },
    });
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco
        titulo="Estimativa de disparos por procedimento"
        dica={`Até ${L.maxEstimativas}, em duas colunas na arte (+ > Tabela de preços). Os valores em reais vêm de Preços.`}
      >
        <ul className="space-y-2">
          {e.estimativas.map((l, i) => {
            const pad = PADRAO.estimativas[i];
            return (
              <li key={i}>
                <div className="flex items-center gap-1.5">
                  <input
                    value={l.procedimento}
                    maxLength={L.procedimento}
                    placeholder="Procedimento"
                    aria-label={`Procedimento ${i + 1}`}
                    onChange={(ev) => {
                      const v = ev.target.value;
                      muda((x) => ({ ...x, estimativas: x.estimativas.map((y, k) => (k === i ? { ...y, procedimento: v } : y)) }));
                    }}
                    className={entrada}
                  />
                  <input
                    value={l.disparos}
                    inputMode="numeric"
                    placeholder="disparos"
                    aria-label={`Disparos de ${l.procedimento || `procedimento ${i + 1}`}`}
                    onChange={(ev) => {
                      const v = soDigitos(ev.target.value);
                      muda((x) => ({ ...x, estimativas: x.estimativas.map((y, k) => (k === i ? { ...y, disparos: v } : y)) }));
                    }}
                    className={`${entrada} !w-28 flex-shrink-0 text-right tabular-nums`}
                  />
                  <button
                    type="button"
                    className={botaoIcone}
                    aria-label={`Tirar ${l.procedimento || "linha"}`}
                    onClick={() => muda((x) => ({ ...x, estimativas: x.estimativas.filter((_, k) => k !== i) }))}
                  >
                    <X size={16} />
                  </button>
                </div>
                {pad && (
                  <p className="mt-0.5 pl-1 text-[10px] text-neutral-400">
                    padrão: {pad.procedimento} · {milhar(pad.disparos)}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={botaoAdd}
            disabled={e.estimativas.length >= L.maxEstimativas}
            onClick={() => muda((x) => ({ ...x, estimativas: [...x.estimativas, { procedimento: "", disparos: "" }] }))}
          >
            <Plus size={15} /> Adicionar
          </button>
          <button
            type="button"
            className={botaoVoltar}
            onClick={() => muda((x) => ({ ...x, estimativas: PADRAO.estimativas.map(paraLinha) }))}
          >
            <RotateCcw size={13} /> Voltar ao padrão
          </button>
        </div>
      </Bloco>

      <Bloco titulo="Linha em destaque" dica="Aparece numa faixa embaixo das estimativas. Sem nome, a faixa some.">
        <div className="flex items-center gap-1.5">
          <input
            value={e.destaque.procedimento}
            maxLength={L.procedimento}
            placeholder="Procedimento"
            aria-label="Procedimento em destaque"
            onChange={(ev) => {
              const v = ev.target.value;
              muda((x) => ({ ...x, destaque: { ...x.destaque, procedimento: v } }));
            }}
            className={entrada}
          />
          <input
            value={e.destaque.disparos}
            inputMode="numeric"
            placeholder="disparos"
            aria-label="Disparos do destaque"
            onChange={(ev) => {
              const v = soDigitos(ev.target.value);
              muda((x) => ({ ...x, destaque: { ...x.destaque, disparos: v } }));
            }}
            className={`${entrada} !w-28 flex-shrink-0 text-right tabular-nums`}
          />
        </div>
        <p className="mt-0.5 pl-1 text-[10px] text-neutral-400">
          padrão: {PADRAO.destaque.procedimento} · {milhar(PADRAO.destaque.disparos)}
        </p>
        <button type="button" className={botaoVoltar} onClick={() => muda((x) => ({ ...x, destaque: paraLinha(PADRAO.destaque) }))}>
          <RotateCcw size={13} /> Voltar ao padrão
        </button>
      </Bloco>

      <Bloco titulo="Informações importantes" dica={`Até ${L.maxInfos} itens com o sinal de certo. Sem itens, o quadro some da arte.`}>
        <ul className="space-y-2">
          {e.infos.map((t, i) => (
            <li key={i}>
              <div className="flex items-center gap-1.5">
                <input
                  value={t}
                  maxLength={L.info}
                  aria-label={`Informação ${i + 1}`}
                  onChange={(ev) => {
                    const v = ev.target.value;
                    muda((x) => ({ ...x, infos: x.infos.map((y, k) => (k === i ? v : y)) }));
                  }}
                  className={entrada}
                />
                <button
                  type="button"
                  className={botaoIcone}
                  aria-label={`Tirar informação ${i + 1}`}
                  onClick={() => muda((x) => ({ ...x, infos: x.infos.filter((_, k) => k !== i) }))}
                >
                  <X size={16} />
                </button>
              </div>
              {PADRAO.infos[i] !== undefined && <p className="mt-0.5 pl-1 text-[10px] text-neutral-400">padrão: {PADRAO.infos[i]}</p>}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={botaoAdd}
            disabled={e.infos.length >= L.maxInfos}
            onClick={() => muda((x) => ({ ...x, infos: [...x.infos, ""] }))}
          >
            <Plus size={15} /> Adicionar
          </button>
          <button type="button" className={botaoVoltar} onClick={() => muda((x) => ({ ...x, infos: [...PADRAO.infos] }))}>
            <RotateCcw size={13} /> Voltar ao padrão
          </button>
        </div>
      </Bloco>

      <Bloco titulo="Nota" dica="Frase em itálico embaixo das estimativas. Vazia, não aparece.">
        <CampoTexto rotulo="Nota" valor={e.nota} onChange={(v) => muda((x) => ({ ...x, nota: v }))} padrao={PADRAO.nota} maxLength={L.nota} multilinha />
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
