"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatarDataHora } from "@/lib/movimentacoes";

function formatarData(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("pt-BR");
}

// Quantos dias faltam até a data (iso = "YYYY-MM-DD"), comparando só a
// parte de data (sem hora), pra não dar off-by-one por causa do fuso.
function diasAte(iso: string) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const alvo = new Date(`${iso}T00:00:00`);
  return Math.round((alvo.getTime() - hoje.getTime()) / 86400000);
}

// Leva T (E3): equipments.status existia desde sempre mas não tinha
// nenhuma tela para mudar de valor, então "manutenção" nunca bloqueava
// nada de verdade. Este controle é o que fecha essa ponta — troca o
// status pela RPC definir_status_equipamento (que já cuida de registrar
// em movimentacoes) e atualiza a página.
//
// Leva U: soma a previsão de retorno. Quando faltam 2 dias ou menos
// para a previsão, mostra um aviso com a opção de adiar (RPC
// adiar_previsao_manutencao). O retorno automático em si acontece no
// banco (aplicar_previsoes_manutencao_vencidas, chamada pela própria
// página antes de listar os equipamentos e pelo trigger da Agenda) —
// este componente só precisa exibir o que já veio do servidor.
export default function EquipamentoStatusControl({
  equipmentId,
  status,
  statusMotivo,
  statusDesde,
  statusPrevistoFim,
}: {
  equipmentId: string;
  status: string;
  statusMotivo: string | null;
  statusDesde: string | null;
  statusPrevistoFim: string | null;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [previstoFim, setPrevistoFim] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdiarForm, setShowAdiarForm] = useState(false);
  const [novaPrevisao, setNovaPrevisao] = useState(statusPrevistoFim ?? "");
  const [adiarWorking, setAdiarWorking] = useState(false);
  const [adiarError, setAdiarError] = useState<string | null>(null);

  const emManutencao = status === "manutencao";
  const diasRestantes = statusPrevistoFim ? diasAte(statusPrevistoFim) : null;
  const avisoRetorno = emManutencao && diasRestantes !== null && diasRestantes <= 2;

  async function definirStatus(novoStatus: "ativo" | "manutencao", motivoParaEnviar: string | null, previstoFimParaEnviar: string | null) {
    setWorking(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("definir_status_equipamento", {
      p_equipment_id: equipmentId,
      p_status: novoStatus,
      p_motivo: motivoParaEnviar,
      p_previsto_fim: previstoFimParaEnviar,
    });
    setWorking(false);
    if (rpcError) {
      setError(rpcError.message || "Não foi possível salvar. Tente novamente.");
      return;
    }
    setShowForm(false);
    setMotivo("");
    setPrevistoFim("");
    router.refresh();
  }

  async function adiarPrevisao() {
    if (!novaPrevisao) {
      setAdiarError("Escolha a nova data prevista.");
      return;
    }
    setAdiarWorking(true);
    setAdiarError(null);
    const { error: rpcError } = await supabase.rpc("adiar_previsao_manutencao", {
      p_equipment_id: equipmentId,
      p_nova_previsao: novaPrevisao,
    });
    setAdiarWorking(false);
    if (rpcError) {
      setAdiarError(rpcError.message || "Não foi possível adiar a previsão. Tente novamente.");
      return;
    }
    setShowAdiarForm(false);
    router.refresh();
  }

  return (
    <div>
      <p
        className={`mt-0.5 text-sm font-medium capitalize ${
          emManutencao ? "text-amber-600 dark:text-amber-400" : "text-neutral-900 dark:text-neutral-100"
        }`}
      >
        {emManutencao ? "Em manutenção" : "Ativo"}
      </p>
      {emManutencao && statusMotivo && (
        <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">Motivo: {statusMotivo}</p>
      )}
      {emManutencao && statusDesde && (
        <p className="text-[11px] text-neutral-400">Desde {formatarDataHora(statusDesde)}</p>
      )}
      {emManutencao && statusPrevistoFim && (
        <p className="text-[11px] text-neutral-400">Previsão de volta: {formatarData(statusPrevistoFim)}</p>
      )}

      {error && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{error}</p>}

      {avisoRetorno && !showAdiarForm && (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-2 dark:border-amber-900/50 dark:bg-amber-900/20">
          <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
            {diasRestantes! <= 0
              ? "A previsão de retorno é hoje. Vai voltar como planejado?"
              : `Faltam ${diasRestantes} dia${diasRestantes === 1 ? "" : "s"} para o retorno previsto (${formatarData(statusPrevistoFim!)}). Vai voltar como planejado?`}
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={() => setShowAdiarForm(true)}
              className="rounded-lg border border-amber-400 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:text-amber-300"
            >
              Adiar previsão
            </button>
          </div>
        </div>
      )}

      {showAdiarForm && (
        <div className="mt-2 rounded-lg bg-neutral-50 p-2 dark:bg-neutral-800/50">
          <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
            Nova previsão de volta
          </label>
          <input
            type="date"
            value={novaPrevisao}
            onChange={(e) => setNovaPrevisao(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
          {adiarError && <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">{adiarError}</p>}
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowAdiarForm(false);
                setAdiarError(null);
                setNovaPrevisao(statusPrevistoFim ?? "");
              }}
              className="flex-1 rounded-lg border border-neutral-300 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
            >
              Desistir
            </button>
            <button
              type="button"
              disabled={adiarWorking}
              onClick={adiarPrevisao}
              className="flex-1 rounded-lg bg-amber-600 py-1.5 text-xs font-medium text-white disabled:opacity-60"
            >
              {adiarWorking ? "Salvando..." : "Confirmar novo prazo"}
            </button>
          </div>
        </div>
      )}

      {emManutencao ? (
        !showAdiarForm && (
          <button
            type="button"
            disabled={working}
            onClick={() => definirStatus("ativo", null, null)}
            className="mt-2 rounded-lg border border-brand-teal px-3 py-1.5 text-xs font-medium text-brand-teal disabled:opacity-60"
          >
            {working ? "Salvando..." : "Voltar para ativo"}
          </button>
        )
      ) : (
        <p className="mt-1 text-[10px] text-neutral-400">Para manutenção, use &quot;Bloquear período&quot; abaixo.</p>
      )}
    </div>
  );
}
