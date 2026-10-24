"use client";

// Empresa: dados da Harmonize que saem no contrato (cabeçalho, quadro do
// contratado, foro e assinatura), no rodapé do recibo e no rodapé do
// prontuário e da ficha do paciente. Contrato já emitido não muda: ele guarda
// os dados da época.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { salvarPreferencias } from "@/lib/settings";
import { esquecerPreferenciasDoNavegador } from "@/lib/usar-preferencias";
import { DEFAULT_PREFERENCIAS, LIMITES_TEXTO, type Preferencias } from "@/lib/preferencias";
import { BarraSalvar, Bloco, CampoTexto } from "../ui";

type Empresa = Preferencias["empresa"];
const PADRAO = DEFAULT_PREFERENCIAS.empresa;
const L = LIMITES_TEXTO;

const OBRIGATORIOS: { k: keyof Empresa; rotulo: string }[] = [
  { k: "razaoSocial", rotulo: "Razão social" },
  { k: "cnpj", rotulo: "CNPJ" },
  { k: "endereco", rotulo: "Endereço" },
  { k: "responsavel", rotulo: "Responsável" },
  { k: "email", rotulo: "E-mail" },
  { k: "cidadeForo", rotulo: "Cidade do foro" },
];

export default function PrefsEmpresa({ preferencias }: { preferencias: Preferencias }) {
  const router = useRouter();
  const inicial = useMemo(() => ({ ...preferencias.empresa }), [preferencias]);
  const [e, setE] = useState<Empresa>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alterado = JSON.stringify(e) !== JSON.stringify(inicial);
  const muda = (k: keyof Empresa) => (v: string) => {
    setE((x) => ({ ...x, [k]: v }));
    setErro(null);
    setSalvo(false);
  };

  async function salvar() {
    const limpo = Object.fromEntries(Object.entries(e).map(([k, v]) => [k, v.trim()])) as Empresa;
    const vazio = OBRIGATORIOS.find((c) => !limpo[c.k]);
    if (vazio) return setErro(`Preencha: ${vazio.rotulo}.`);
    if (!/^\S+@\S+\.\S+$/.test(limpo.email)) return setErro("Confira o e-mail.");
    setSalvando(true);
    setErro(null);
    const r = await salvarPreferencias(createClient(), { empresa: limpo });
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
        titulo="Dados da Harmonize"
        dica="Saem no contrato: cabeçalho, quadro do contratado, assinatura e foro. Contrato já emitido continua com os dados da época."
      >
        <div className="space-y-3">
          <CampoTexto rotulo="Razão social" valor={e.razaoSocial} onChange={muda("razaoSocial")} padrao={PADRAO.razaoSocial} maxLength={L.empresaCurto} />
          <CampoTexto rotulo="CNPJ" valor={e.cnpj} onChange={muda("cnpj")} padrao={PADRAO.cnpj} maxLength={30} />
          <CampoTexto rotulo="Endereço" valor={e.endereco} onChange={muda("endereco")} padrao={PADRAO.endereco} maxLength={L.empresaLongo} multilinha />
          <CampoTexto
            rotulo="Responsável (quem assina pela Harmonize)"
            valor={e.responsavel}
            onChange={muda("responsavel")}
            padrao={PADRAO.responsavel}
            maxLength={L.empresaCurto}
          />
          <CampoTexto rotulo="E-mail" tipo="email" valor={e.email} onChange={muda("email")} padrao={PADRAO.email} maxLength={L.empresaCurto} />
          <CampoTexto
            rotulo="Cidade do foro (também a cidade da data do contrato)"
            valor={e.cidadeForo}
            onChange={muda("cidadeForo")}
            padrao={PADRAO.cidadeForo}
            maxLength={60}
          />
        </div>
      </Bloco>

      <Bloco titulo="Rodapés" dica="Frase no pé do recibo e do prontuário/ficha do paciente. Deixe vazio para não mostrar.">
        <div className="space-y-3">
          <CampoTexto rotulo="Rodapé do recibo" valor={e.rodapeRecibo} onChange={muda("rodapeRecibo")} padrao={PADRAO.rodapeRecibo} maxLength={L.empresaLongo} />
          <CampoTexto
            rotulo="Rodapé do prontuário e da ficha do paciente"
            valor={e.rodapeDocumentos}
            onChange={muda("rodapeDocumentos")}
            padrao={PADRAO.rodapeDocumentos}
            maxLength={L.empresaLongo}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setE({ ...PADRAO });
            setErro(null);
            setSalvo(false);
          }}
          className="mt-3 flex min-h-11 items-center gap-1.5 text-xs font-medium text-neutral-500 active:text-neutral-800"
        >
          <RotateCcw size={13} /> Voltar tudo ao padrão
        </button>
      </Bloco>

      <BarraSalvar alterado={alterado} salvando={salvando} salvo={salvo} erro={erro} onSalvar={salvar} onDescartar={() => setE(inicial)} />
    </div>
  );
}
