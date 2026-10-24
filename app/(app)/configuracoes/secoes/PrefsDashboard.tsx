"use client";

// Dashboard: quantos avisos aparecem, quais avisos e blocos ficam à mostra.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { AVISOS_DASHBOARD, BLOCOS_DASHBOARD, DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { BarraSalvar, Bloco, Campo, Chave, numero } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.dashboard;

function estado(p: Preferencias) {
  return {
    visiveis: String(p.dashboard.avisosVisiveis),
    avisosOcultos: [...p.dashboard.avisosOcultos].sort(),
    blocosOcultos: [...p.dashboard.blocosOcultos].sort(),
  };
}
type Estado = ReturnType<typeof estado>;

function alterna(lista: string[], id: string, ligado: boolean): string[] {
  const sem = lista.filter((x) => x !== id);
  return (ligado ? sem : [...sem, id]).sort();
}

export default function PrefsDashboard({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => estado(preferencias), [preferencias]);
  const [e, setE] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  function mexe(f: (x: Estado) => Estado) {
    setE(f);
    setErro(null);
    setSalvo(false);
  }

  async function salvar() {
    const visiveis = Math.round(numero(e.visiveis));
    if (!(visiveis >= 1 && visiveis <= 12)) {
      setErro("Os avisos que aparecem de início vão de 1 a 12.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), {
      dashboard: { avisosVisiveis: visiveis, avisosOcultos: e.avisosOcultos, blocosOcultos: e.blocosOcultos },
    });
    setSalvando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  const voltar = (k: "avisos" | "blocos") => () =>
    mexe((x) => (k === "avisos" ? { ...x, visiveis: String(PADRAO.avisosVisiveis), avisosOcultos: [] } : { ...x, blocosOcultos: [] }));

  const botaoPadrao = "mt-3 min-h-[44px] rounded-xl px-3 text-xs font-semibold text-brand-teal-dark active:bg-neutral-100";

  return (
    <div className="space-y-4 pb-28">
      <Bloco titulo="Avisos de &quot;Precisa de você&quot;" dica="Avisos urgentes de dinheiro continuam aparecendo mesmo desligados. O aviso de acesso ao Planejador também.">
        <div className="max-w-[220px]">
          <Campo
            rotulo="Quantos aparecem de início"
            valor={e.visiveis}
            onChange={(v) => mexe((x) => ({ ...x, visiveis: v.replace(/\D/g, "") }))}
            sufixo="de 1 a 12"
          />
          <p className="mt-1 text-[11px] text-neutral-400">padrão {PADRAO.avisosVisiveis}</p>
        </div>
        <ul className="mt-3 divide-y divide-neutral-100">
          {AVISOS_DASHBOARD.map((a) => {
            const ligado = !e.avisosOcultos.includes(a.id);
            return (
              <li key={a.id} className="flex min-h-[56px] items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-semibold ${ligado ? "text-neutral-900" : "text-neutral-400"}`}>{a.rotulo}</span>
                  <span className="block text-xs text-neutral-500">{a.dica}</span>
                </span>
                <Chave ligada={ligado} rotulo={a.rotulo} onChange={(v) => mexe((x) => ({ ...x, avisosOcultos: alterna(x.avisosOcultos, a.id, v) }))} />
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={voltar("avisos")} className={botaoPadrao}>
          Voltar ao padrão
        </button>
      </Bloco>

      <Bloco titulo="Blocos do Dashboard" dica="O destaque do mês e o &quot;Precisa de você&quot; sempre aparecem. Ligado = aparece.">
        <ul className="divide-y divide-neutral-100">
          {BLOCOS_DASHBOARD.map((b) => {
            const ligado = !e.blocosOcultos.includes(b.id);
            return (
              <li key={b.id} className="flex min-h-[52px] items-center gap-3 py-2">
                <span className={`min-w-0 flex-1 text-sm font-semibold ${ligado ? "text-neutral-900" : "text-neutral-400"}`}>{b.rotulo}</span>
                <Chave ligada={ligado} rotulo={b.rotulo} onChange={(v) => mexe((x) => ({ ...x, blocosOcultos: alterna(x.blocosOcultos, b.id, v) }))} />
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={voltar("blocos")} className={botaoPadrao}>
          Voltar ao padrão
        </button>
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
