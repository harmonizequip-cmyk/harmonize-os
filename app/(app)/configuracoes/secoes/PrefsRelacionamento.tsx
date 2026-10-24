"use client";

// Relacionamento: cadência por classe, limite de "Chamar hoje" e os limites
// que separam Nova, Em risco, Sumida, Morna, VIP e Frequente.
// Grava o grupo `relacionamento` das preferências.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { DEFAULT_PREFERENCIAS, type ClasseCadencia, type Preferencias } from "@/lib/preferencias";
import { BarraSalvar, Bloco, Campo, numero } from "../ui";

type Cfg = Preferencias["relacionamento"];
const PADRAO = DEFAULT_PREFERENCIAS.relacionamento;

const CLASSES: { id: ClasseCadencia; rotulo: string; dica: string }[] = [
  { id: "nova", rotulo: "Nova", dica: "Cliente com 1 locação feita há pouco." },
  { id: "ativa", rotulo: "Ativa", dica: "Cliente locando no ritmo dela, sem data marcada." },
  { id: "em_risco", rotulo: "Em risco", dica: "Cliente que passou do tempo em que costuma voltar." },
  { id: "sumida", rotulo: "Sumida", dica: "Cliente há muito tempo sem locar." },
  { id: "quente", rotulo: "Quente", dica: "Lead com interesse ou data em vista." },
  { id: "morna", rotulo: "Morna", dica: "Lead em conversa." },
  { id: "fria", rotulo: "Fria", dica: "Lead parado." },
];

function estado(c: Cfg) {
  const cad = {} as Record<ClasseCadencia, string>;
  for (const k of CLASSES) cad[k.id] = String(c.cadencia[k.id]);
  return {
    cad,
    limiteDiario: String(c.limiteDiario),
    riscoMultiplicador: String(c.riscoMultiplicador).replace(".", ","),
    riscoMinimoDias: String(c.riscoMinimoDias),
    riscoSemRitmoDias: String(c.riscoSemRitmoDias),
    sumidaDias: String(c.sumidaDias),
    novaAteDias: String(c.novaAteDias),
    mornaDias: String(c.mornaDias),
    vipFatia: String(Math.round(c.vipFatia * 100)),
    frequenteFatia: String(Math.round(c.frequenteFatia * 100)),
  };
}
type Estado = ReturnType<typeof estado>;

function Padrao({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px] text-neutral-400">{children}</p>;
}

function Voltar({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mt-3 min-h-[44px] text-xs font-semibold text-brand-teal-dark">
      Voltar ao padrão
    </button>
  );
}

export default function PrefsRelacionamento({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => estado(preferencias.relacionamento), [preferencias]);
  const [e, setE] = useState<Estado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  const padrao = estado(PADRAO);

  function muda(k: Exclude<keyof Estado, "cad">) {
    return (v: string) => {
      setE((x) => ({ ...x, [k]: v }));
      setErro(null);
      setSalvo(false);
    };
  }
  function mudaCad(k: ClasseCadencia) {
    return (v: string) => {
      setE((x) => ({ ...x, cad: { ...x.cad, [k]: v } }));
      setErro(null);
      setSalvo(false);
    };
  }

  async function salvar() {
    const inteiro = (v: string, min: number, max: number) => {
      const n = numero(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const cadencia = {} as Record<ClasseCadencia, number>;
    for (const k of CLASSES) {
      const n = inteiro(e.cad[k.id], 1, 365);
      if (n === null) return setErro(`Cadência de ${k.rotulo}: número inteiro de 1 a 365 dias.`);
      cadencia[k.id] = n;
    }
    const limiteDiario = inteiro(e.limiteDiario, 1, 50);
    if (limiteDiario === null) return setErro("Chamar hoje: de 1 a 50 pessoas por dia.");
    const mult = numero(e.riscoMultiplicador);
    if (!(mult >= 1 && mult <= 5)) return setErro("Em risco: o multiplicador do ritmo vai de 1 a 5 (ex.: 1,5).");
    const riscoMinimoDias = inteiro(e.riscoMinimoDias, 1, 365);
    if (riscoMinimoDias === null) return setErro("Em risco: mínimo de 1 a 365 dias.");
    const riscoSemRitmoDias = inteiro(e.riscoSemRitmoDias, 1, 730);
    if (riscoSemRitmoDias === null) return setErro("Em risco sem ritmo: de 1 a 730 dias.");
    const sumidaDias = inteiro(e.sumidaDias, 1, 1095);
    if (sumidaDias === null) return setErro("Sumida: de 1 a 1095 dias.");
    const novaAteDias = inteiro(e.novaAteDias, 1, 365);
    if (novaAteDias === null) return setErro("Nova: de 1 a 365 dias.");
    const mornaDias = inteiro(e.mornaDias, 1, 180);
    if (mornaDias === null) return setErro("Lead morno: de 1 a 180 dias.");
    const vip = inteiro(e.vipFatia, 5, 95);
    const freq = inteiro(e.frequenteFatia, 5, 99);
    if (vip === null) return setErro("VIP: de 5% a 95% do faturamento.");
    if (freq === null) return setErro("Frequente: de 5% a 99% do faturamento.");
    if (freq <= vip) return setErro("Frequente tem que ser maior que VIP (ex.: VIP 50%, Frequente 80%).");

    const novo: Cfg = {
      cadencia,
      limiteDiario,
      riscoMultiplicador: mult,
      riscoMinimoDias,
      riscoSemRitmoDias,
      sumidaDias,
      novaAteDias,
      mornaDias,
      vipFatia: vip / 100,
      frequenteFatia: freq / 100,
    };
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { relacionamento: novo });
    setSalvando(false);
    if (r.erro) return setErro(r.erro);
    if (JSON.stringify(r.preferencias.relacionamento) !== JSON.stringify(novo)) {
      return setErro("Algum valor foi recusado por estar fora da faixa permitida. Confira os números e tente de novo.");
    }
    esquecerPreferenciasDoNavegador();
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
    router.refresh();
  }

  const so = (campos: Partial<Estado>) => setE((x) => ({ ...x, ...campos }));

  return (
    <div className="space-y-4 pb-28">
      <Bloco
        titulo="Cadência"
        dica="Quantos dias sem conversa até a pessoa voltar para a lista de quem chamar. Quem já tem atendimento marcado fica fora: a confirmação cuida."
      >
        <div className="space-y-3">
          {CLASSES.map((c) => (
            <div key={c.id}>
              <Campo rotulo={c.rotulo} valor={e.cad[c.id]} onChange={mudaCad(c.id)} sufixo="dias" />
              <Padrao>
                {c.dica} Padrão {padrao.cad[c.id]}.
              </Padrao>
            </div>
          ))}
        </div>
        <Voltar onClick={() => so({ cad: padrao.cad })} />
      </Bloco>

      <Bloco titulo="Chamar hoje" dica="O resto espera para outro dia, sem virar pilha.">
        <Campo rotulo="Máximo de pessoas por dia" valor={e.limiteDiario} onChange={muda("limiteDiario")} sufixo="pessoas" />
        <Padrao>Padrão {padrao.limiteDiario}.</Padrao>
        <Voltar onClick={() => so({ limiteDiario: padrao.limiteDiario })} />
      </Bloco>

      <Bloco titulo="Como classifica" dica="Os limites que separam uma classe da outra. A prioridade da fila não muda.">
        <div className="space-y-3">
          <div>
            <Campo rotulo="Nova: até quantos dias da 1ª locação" valor={e.novaAteDias} onChange={muda("novaAteDias")} sufixo="dias" />
            <Padrao>Cliente com 1 locação. Padrão {padrao.novaAteDias}.</Padrao>
          </div>
          <div>
            <Campo
              rotulo="Em risco: multiplicador do ritmo"
              valor={e.riscoMultiplicador}
              onChange={muda("riscoMultiplicador")}
              sufixo="vezes"
              decimal
            />
            <Padrao>Passou de tantas vezes o intervalo médio entre as locações dela. Padrão {padrao.riscoMultiplicador}.</Padrao>
          </div>
          <div>
            <Campo rotulo="Em risco: mínimo de dias sem locar" valor={e.riscoMinimoDias} onChange={muda("riscoMinimoDias")} sufixo="dias" />
            <Padrao>Padrão {padrao.riscoMinimoDias}.</Padrao>
          </div>
          <div>
            <Campo rotulo="Em risco: sem ritmo ainda" valor={e.riscoSemRitmoDias} onChange={muda("riscoSemRitmoDias")} sufixo="dias" />
            <Padrao>Para quem tem menos de 2 locações. Padrão {padrao.riscoSemRitmoDias}.</Padrao>
          </div>
          <div>
            <Campo rotulo="Sumida: mais de quantos dias sem locar" valor={e.sumidaDias} onChange={muda("sumidaDias")} sufixo="dias" />
            <Padrao>Padrão {padrao.sumidaDias}.</Padrao>
          </div>
          <div>
            <Campo rotulo="Lead morno: conversa nos últimos" valor={e.mornaDias} onChange={muda("mornaDias")} sufixo="dias" />
            <Padrao>Sem conversa nesse prazo, o lead vira frio. Padrão {padrao.mornaDias}.</Padrao>
          </div>
          <div>
            <Campo rotulo="VIP: primeiros % do faturamento" valor={e.vipFatia} onChange={muda("vipFatia")} sufixo="%" />
            <Padrao>As clientes que, somadas, fazem essa parte do faturamento. Padrão {padrao.vipFatia}%.</Padrao>
          </div>
          <div>
            <Campo rotulo="Frequente: até % do faturamento" valor={e.frequenteFatia} onChange={muda("frequenteFatia")} sufixo="%" />
            <Padrao>Maior que o VIP. Padrão {padrao.frequenteFatia}%.</Padrao>
          </div>
        </div>
        <Voltar
          onClick={() =>
            so({
              novaAteDias: padrao.novaAteDias,
              riscoMultiplicador: padrao.riscoMultiplicador,
              riscoMinimoDias: padrao.riscoMinimoDias,
              riscoSemRitmoDias: padrao.riscoSemRitmoDias,
              sumidaDias: padrao.sumidaDias,
              mornaDias: padrao.mornaDias,
              vipFatia: padrao.vipFatia,
              frequenteFatia: padrao.frequenteFatia,
            })
          }
        />
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
