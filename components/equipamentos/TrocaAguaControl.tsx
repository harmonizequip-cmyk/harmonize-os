"use client";

// Troca de água do HIPRO (a cada 15 dias, e-book do HIPRO): mostra a situação
// e a última troca, registra a troca feita (registrar_manutencao_equipamento)
// e abre o guia de cuidados. Visualização só vê. Sem o SQL rodado, a faixa
// aparece e o botão avisa "Falta rodar o SQL da manutenção".

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ChevronRight, Droplets } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { avisar, confirmar } from "@/components/Dialogos";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import CuidadosHiproModal from "@/components/equipamentos/CuidadosHiproModal";
import {
  MSG_FALTA_SQL_MANUTENCAO,
  faltaSqlManutencao,
  situacaoAgua,
  textoAgua,
} from "@/lib/manutencao-equipamento";

export default function TrocaAguaControl({
  equipmentId,
  ultima,
  ultimaId,
  semSql,
  erroCarga = null,
}: {
  equipmentId: string;
  ultima: string | null;
  ultimaId: string | null;
  semSql: boolean;
  /** Erro ao ler as trocas (fora o SQL não rodado): aparece na faixa. */
  erroCarga?: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const hoje = hojeLocal();
  const [aberto, setAberto] = useState(false);
  const [guia, setGuia] = useState(false);
  const [data, setData] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const e = situacaoAgua(ultima, hoje);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_manutencao_equipamento", {
      p_equipment_id: equipmentId,
      p_tipo: "troca_agua",
      p_data: data,
    });
    setSalvando(false);
    if (error) {
      if (faltaSqlManutencao(error)) return setErro(MSG_FALTA_SQL_MANUTENCAO);
      return setErro(error.message || "Não consegui salvar. Tente de novo.");
    }
    setAberto(false);
    avisar("Troca de água registrada.");
    router.refresh();
  }

  async function desfazer() {
    if (!ultimaId || !ultima) return;
    const ok = await confirmar({
      titulo: "Desfazer a troca de água?",
      texto: `Apaga o registro de ${formatDate(ultima)}. Use só se marcou por engano.`,
      confirmar: "Desfazer",
      perigo: true,
    });
    if (!ok) return;
    const { error } = await supabase.rpc("excluir_manutencao_equipamento", { p_id: ultimaId });
    if (error) return avisar(faltaSqlManutencao(error) ? MSG_FALTA_SQL_MANUTENCAO : error.message || "Não consegui desfazer.", "erro");
    router.refresh();
  }

  const cor =
    e.situacao === "atrasada" || e.situacao === "vence_hoje"
      ? "font-semibold text-red-600"
      : e.situacao === "vence_logo" || e.situacao === "nunca"
        ? "font-semibold text-amber-600"
        : "text-slate-500";

  const texto = semSql
    ? "Registro ainda não ligado."
    : erroCarga
      ? `Não consegui ler as trocas: ${erroCarga}`
      : textoAgua(e);

  return (
    <div className="rounded-3xl bg-sky-50/70 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Droplets size={28} strokeWidth={1.7} className="flex-shrink-0 text-sky-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold text-slate-900">Troca de água</p>
          <p className={`text-[13px] leading-snug ${semSql ? "text-slate-500" : erroCarga ? "text-red-600" : cor}`}>{texto}</p>
          {ultima && !semSql && !erroCarga && (
            <p className="text-[12px] text-slate-500">
              Última em {formatDate(ultima)} · a cada 15 dias
              {!somenteLeitura && ultimaId && (
                <>
                  {" · "}
                  <button type="button" onClick={desfazer} className="underline">
                    desfazer
                  </button>
                </>
              )}
            </p>
          )}
        </div>
        {!aberto && !somenteLeitura && (
          <button
            type="button"
            onClick={() => {
              if (semSql) return avisar(MSG_FALTA_SQL_MANUTENCAO, "erro");
              setData(hoje);
              setErro(null);
              setAberto(true);
            }}
            className="flex w-full flex-shrink-0 items-center justify-end gap-0.5 text-[13.5px] font-semibold leading-tight text-sky-700 min-[430px]:w-auto"
          >
            <span>{ultima ? "Troquei a água" : "Informar última troca"}</span>
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      {aberto && (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Dia em que a água foi trocada</label>
            <input
              type="date"
              value={data}
              max={hoje}
              onChange={(ev) => setData(ev.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-sm"
            />
          </div>
          <button type="button" disabled={salvando || !data} onClick={salvar} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            Salvar
          </button>
          <button type="button" onClick={() => setAberto(false)} className="px-1 text-xs text-slate-500 underline">
            voltar
          </button>
        </div>
      )}
      {aberto && (
        <p className="mt-1.5 text-[12px] text-slate-500">Só água destilada, deionizada, desmineralizada ou para autoclave, cerca de 1,5 litro.</p>
      )}
      {erro && <p className="mt-1.5 text-[12px] text-red-600">{erro}</p>}

      <button type="button" onClick={() => setGuia(true)} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-sky-700">
        <BookOpen size={15} />
        Ver cuidados
      </button>
      {guia && <CuidadosHiproModal onClose={() => setGuia(false)} />}
    </div>
  );
}
