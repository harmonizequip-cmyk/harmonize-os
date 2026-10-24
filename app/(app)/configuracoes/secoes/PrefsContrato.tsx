"use client";

// Contrato: os números das cláusulas (multa e aviso prévio de rescisão). O
// texto jurídico não muda; só o número e o extenso. Contrato já emitido
// continua com os números da época.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { textoPenalidades, textoRescisao } from "@/lib/contrato-textos";
import { BarraSalvar, Bloco, Campo, numero } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.contrato;

function estado(p: Preferencias) {
  return { multa: String(p.contrato.multaPercentual), aviso: String(p.contrato.avisoRescisaoHoras) };
}
type Estado = ReturnType<typeof estado>;

export default function PrefsContrato({ preferencias }: { preferencias: Preferencias }) {
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
  const multa = Math.round(numero(e.multa));
  const aviso = Math.round(numero(e.aviso));
  const valido = e.multa !== "" && multa >= 0 && multa <= 100 && aviso >= 1 && aviso <= 720;

  async function salvar() {
    if (!(e.multa !== "" && multa >= 0 && multa <= 100)) return setErro("A multa vai de 0% a 100%.");
    if (!(aviso >= 1 && aviso <= 720)) return setErro("O aviso prévio vai de 1 a 720 horas.");
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { contrato: { multaPercentual: multa, avisoRescisaoHoras: aviso } });
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco titulo="Números do contrato" dica="Só os números mudam; o texto das cláusulas é o de sempre. Contrato já emitido continua igual.">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Campo rotulo="Multa (6ª cláusula)" valor={e.multa} onChange={muda("multa")} sufixo="%" />
            <p className="mt-1 text-[11px] text-neutral-400">padrão {PADRAO.multaPercentual}%</p>
          </div>
          <div>
            <Campo rotulo="Aviso de rescisão (7ª)" valor={e.aviso} onChange={muda("aviso")} sufixo="horas" />
            <p className="mt-1 text-[11px] text-neutral-400">padrão {PADRAO.avisoRescisaoHoras} horas</p>
          </div>
        </div>
        {valido && (
          <div className="mt-3 space-y-2 rounded-xl bg-neutral-50 p-3 text-[11.5px] leading-relaxed text-neutral-600">
            <p className="font-semibold text-neutral-700">Como fica no contrato</p>
            <p>{textoPenalidades({ multaPercentual: multa, avisoRescisaoHoras: aviso })}</p>
            <p>{textoRescisao({ multaPercentual: multa, avisoRescisaoHoras: aviso })}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setE({ multa: String(PADRAO.multaPercentual), aviso: String(PADRAO.avisoRescisaoHoras) });
            setErro(null);
            setSalvo(false);
          }}
          className="mt-3 min-h-[44px] rounded-xl px-3 text-xs font-semibold text-brand-teal-dark active:bg-neutral-100"
        >
          Voltar ao padrão ({PADRAO.multaPercentual}% / {PADRAO.avisoRescisaoHoras} horas)
        </button>
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
