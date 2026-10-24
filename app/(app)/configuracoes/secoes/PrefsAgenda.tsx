"use client";

// Agenda: encaixe de datas livres (raio, janela, pessoas por data, pergunta ao
// cancelar) e a cidade base da imagem de datas. Grava o grupo `encaixe`.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { DEFAULT_PREFERENCIAS, type Preferencias } from "@/lib/preferencias";
import { BarraSalvar, Bloco, Campo, Chave, numero } from "../ui";

type Cfg = Preferencias["encaixe"];
const PADRAO = DEFAULT_PREFERENCIAS.encaixe;

function estado(c: Cfg) {
  return {
    raioKm: String(c.raioKm),
    diasAFrente: String(c.diasAFrente),
    porData: String(c.porData),
    perguntar: c.perguntarAoCancelar,
    cidadeBase: c.cidadeBase,
  };
}
type Estado = ReturnType<typeof estado>;

function Padrao({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-neutral-400">{children}</p>;
}

export default function PrefsAgenda({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => estado(preferencias.encaixe), [preferencias]);
  const [e, setE] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  const padrao = estado(PADRAO);

  function muda<K extends keyof Estado>(k: K) {
    return (v: Estado[K]) => {
      setE((x) => ({ ...x, [k]: v }));
      setErro(null);
      setSalvo(false);
    };
  }

  async function salvar() {
    const inteiro = (v: string, min: number, max: number) => {
      const n = numero(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const raioKm = inteiro(e.raioKm, 10, 1000);
    if (raioKm === null) return setErro("Raio: de 10 a 1000 km.");
    const diasAFrente = inteiro(e.diasAFrente, 3, 90);
    if (diasAFrente === null) return setErro("Janela: de 3 a 90 dias.");
    const porData = inteiro(e.porData, 1, 50);
    if (porData === null) return setErro("Pessoas por data: de 1 a 50.");
    const novo: Cfg = {
      raioKm,
      diasAFrente,
      porData,
      perguntarAoCancelar: e.perguntar,
      cidadeBase: e.cidadeBase.trim().slice(0, 60),
    };
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { encaixe: novo });
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    if (JSON.stringify(r.preferencias.encaixe) !== JSON.stringify(novo)) {
      return setErro("Algum valor foi recusado por estar fora da faixa permitida. Confira os números e tente de novo.");
    }
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  return (
    <div className="space-y-4 pb-28">
      <Bloco
        titulo="Encaixe de datas livres"
        dica="Um dia livre nos dois HIPROs, colado a um atendimento, vira oportunidade para oferecer a quem mora perto. A distância é em linha reta; cidade que não está em Configurações > Cidades não entra."
      >
        <div className="space-y-3">
          <div>
            <Campo rotulo="Raio de busca" valor={e.raioKm} onChange={muda("raioKm")} sufixo="km" />
            <Padrao>Padrão {padrao.raioKm} km.</Padrao>
          </div>
          <div>
            <Campo rotulo="Janela: quantos dias à frente olhar" valor={e.diasAFrente} onChange={muda("diasAFrente")} sufixo="dias" />
            <Padrao>Padrão {padrao.diasAFrente} dias.</Padrao>
          </div>
          <div>
            <Campo rotulo="Pessoas listadas por data" valor={e.porData} onChange={muda("porData")} sufixo="pessoas" />
            <Padrao>Padrão {padrao.porData}.</Padrao>
          </div>
          <div className="flex min-h-[44px] items-center justify-between gap-3">
            <span className="min-w-0 text-sm font-medium text-neutral-800">Perguntar quem encaixar ao cancelar ou reagendar</span>
            <Chave ligada={e.perguntar} onChange={muda("perguntar")} rotulo="Perguntar quem encaixar ao cancelar ou reagendar" />
          </div>
        </div>
        <button
          type="button"
          className="mt-3 min-h-[44px] text-xs font-semibold text-brand-teal-dark"
          onClick={() => setE((x) => ({ ...x, raioKm: padrao.raioKm, diasAFrente: padrao.diasAFrente, porData: padrao.porData, perguntar: padrao.perguntar }))}
        >
          Voltar ao padrão
        </button>
      </Bloco>

      <Bloco
        titulo="Imagem de datas livres"
        dica="Com a cidade base preenchida, o dia seguinte a um atendimento em outra cidade não é sugerido como livre. Vazio: sem essa regra. Quem digitar a cidade direto na imagem usa o valor do próprio aparelho."
      >
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-600">Cidade base</span>
          <input
            value={e.cidadeBase}
            onChange={(ev) => muda("cidadeBase")(ev.target.value)}
            placeholder="Ex.: João Pessoa"
            className="min-h-[44px] w-full rounded-xl border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-900 outline-none focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/20"
          />
        </label>
        <Padrao>Padrão: vazio.</Padrao>
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
