"use client";

// Metas: quantas locações no mês e a base do cálculo de "quanto falta".

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { BarraSalvar, Bloco, Campo, numero } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.metas;
const OPCOES_BASE = [30, 60, 90, 180];

function estado(p: Preferencias) {
  return { min: String(p.metas.min), max: String(p.metas.max), base: String(p.metas.baseLucroDias) };
}
type Estado = ReturnType<typeof estado>;

export default function PrefsMetas({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => estado(preferencias), [preferencias]);
  const [e, setE] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  const muda = (k: keyof Estado) => (v: string) => {
    setE((x) => ({ ...x, [k]: v.replace(/\D/g, "") }));
    setErro(null);
    setSalvo(false);
  };
  const baseNum = Math.round(numero(e.base));
  const baseEhOpcao = OPCOES_BASE.includes(baseNum) && e.base === String(baseNum);

  async function salvar() {
    const min = Math.round(numero(e.min));
    const max = Math.round(numero(e.max));
    const base = Math.round(numero(e.base));
    if (!(min >= 1 && min <= 500) || !(max >= 1 && max <= 500)) {
      setErro("As metas devem ficar entre 1 e 500 locações.");
      return;
    }
    if (min > max) {
      setErro("A meta mínima não pode ser maior que a máxima.");
      return;
    }
    if (!(base >= 30 && base <= 365)) {
      setErro("A base do cálculo vai de 30 a 365 dias.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { metas: { min, max, baseLucroDias: base } });
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

  function voltarAoPadrao() {
    setE({ min: String(PADRAO.min), max: String(PADRAO.max), base: String(PADRAO.baseLucroDias) });
    setErro(null);
    setSalvo(false);
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco
        titulo="Meta de locações no mês"
        dica="Aparece no anel do destaque do mês, no Dashboard: abaixo da mínima é caminho, entre as duas é meta batida, acima da máxima é mês excelente."
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Campo rotulo="Meta mínima" valor={e.min} onChange={muda("min")} sufixo="locações" />
            <p className="mt-1 text-[11px] text-neutral-400">padrão {PADRAO.min}</p>
          </div>
          <div>
            <Campo rotulo="Meta máxima" valor={e.max} onChange={muda("max")} sufixo="locações" />
            <p className="mt-1 text-[11px] text-neutral-400">padrão {PADRAO.max}</p>
          </div>
        </div>
        <button type="button" onClick={voltarAoPadrao} className="mt-3 min-h-[44px] rounded-xl px-3 text-xs font-semibold text-brand-teal-dark active:bg-neutral-100">
          Voltar ao padrão ({PADRAO.min} a {PADRAO.max} / {PADRAO.baseLucroDias} dias)
        </button>
      </Bloco>

      <Bloco
        titulo="Base do cálculo de quanto falta"
        dica="Para estimar quantas locações faltam para cobrir as contas fixas, o sistema usa a média de lucro por locação dos últimos dias."
      >
        <div className="flex flex-wrap gap-2">
          {OPCOES_BASE.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => muda("base")(String(d))}
              className={`min-h-[44px] rounded-xl px-4 text-sm font-bold ${baseNum === d && baseEhOpcao ? "bg-brand-teal text-white" : "bg-neutral-100 text-neutral-700"}`}
            >
              {d} dias
            </button>
          ))}
        </div>
        <div className="mt-3 max-w-[200px]">
          <Campo rotulo="Ou outro valor (30 a 365)" valor={e.base} onChange={muda("base")} sufixo="dias" />
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">padrão {PADRAO.baseLucroDias} dias</p>
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
