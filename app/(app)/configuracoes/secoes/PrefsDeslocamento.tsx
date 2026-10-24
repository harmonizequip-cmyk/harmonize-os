"use client";

// Deslocamento: quanto se cobra por bloco de km (ida e volta) na calculadora
// da locação. Locações já lançadas não mudam.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { calcularValorDeslocamento } from "@/lib/rental-calculator";
import { formatCurrency } from "@/lib/format";
import { BarraSalvar, Bloco, Campo, numero } from "../ui";

const PADRAO = DEFAULT_PREFERENCIAS.deslocamento;
const tx = (n: number) => String(n).replace(".", ",");

export default function PrefsDeslocamento({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = { valor: tx(preferencias.deslocamento.valorPorBloco), km: tx(preferencias.deslocamento.kmPorBloco) };
  const [valor, setValor] = useState(inicial.valor);
  const [km, setKm] = useState(inicial.km);
  const [kmIda, setKmIda] = useState("60");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = valor !== inicial.valor || km !== inicial.km;
  const v = numero(valor);
  const k = numero(km);
  const valido = v >= 0 && v <= 5000 && k >= 5 && k <= 500;
  const cfg = { valorPorBloco: v, kmPorBloco: k };

  function muda(set: (x: string) => void) {
    return (x: string) => {
      set(x.replace(/[^\d,.]/g, ""));
      setErro(null);
      setSalvo(false);
    };
  }

  async function salvar() {
    if (!valido) {
      setErro("Valor de 0 a 5.000 e bloco de 5 a 500 km.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { deslocamento: cfg });
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

  const exemplos = [30, 60, 70, 100];

  return (
    <div className="space-y-4 pb-28">
      <Bloco
        titulo="Deslocamento"
        dica="Cobrança pela distância na calculadora da locação: o km de ida vira ida e volta e é arredondado para o bloco mais próximo. Locações já lançadas não mudam."
      >
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo={`Valor por bloco (padrão ${PADRAO.valorPorBloco})`} valor={valor} onChange={muda(setValor)} prefixo="R$" decimal />
          <Campo rotulo={`Tamanho do bloco (padrão ${PADRAO.kmPorBloco})`} valor={km} onChange={muda(setKm)} sufixo="km" decimal />
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          O bloco conta ida e volta. Padrão: R$ {PADRAO.valorPorBloco} a cada {PADRAO.kmPorBloco} km.
        </p>
        <button
          type="button"
          onClick={() => {
            setValor(tx(PADRAO.valorPorBloco));
            setKm(tx(PADRAO.kmPorBloco));
            setErro(null);
          }}
          className="mt-3 min-h-[44px] rounded-xl px-3 text-xs font-semibold text-brand-teal-dark ring-1 ring-neutral-200 active:bg-neutral-50"
        >
          Voltar ao padrão
        </button>
      </Bloco>

      <Bloco titulo="Simulador" dica="Confira o valor com os números digitados acima, antes de salvar.">
        <div className="max-w-[10rem]">
          <Campo rotulo="km de ida" valor={kmIda} onChange={(x) => setKmIda(x.replace(/\D/g, ""))} sufixo="km" />
        </div>
        <p className="mt-3 text-sm text-neutral-700">
          {valido ? (
            <>
              {numero(kmIda) || 0} km de ida = <strong>{formatCurrency(calcularValorDeslocamento(numero(kmIda) || 0, cfg))}</strong>
            </>
          ) : (
            "Corrija os valores acima para simular."
          )}
        </p>
        {valido && (
          <ul className="mt-2 grid grid-cols-2 gap-1.5 text-xs text-neutral-600">
            {exemplos.map((e) => (
              <li key={e} className="rounded-xl bg-neutral-50 px-3 py-2">
                {e} km: <strong>{formatCurrency(calcularValorDeslocamento(e, cfg))}</strong>
              </li>
            ))}
          </ul>
        )}
      </Bloco>

      <BarraSalvar
        alterado={alterado}
        salvando={salvando}
        salvo={salvo}
        erro={erro}
        onSalvar={salvar}
        onDescartar={() => {
          setValor(inicial.valor);
          setKm(inicial.km);
          setErro(null);
        }}
      />
    </div>
  );
}
