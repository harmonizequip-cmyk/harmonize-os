"use client";

// "Veio de campanha?" na hora de agendar: o dono liga à mão a reserva/locação à campanha
// que a pessoa recebeu. Só aparece quando a pessoa recebeu alguma campanha e ainda não
// está marcada como "agendou" nela. Ligar = registrar_envio_campanha(status 'agendou'),
// que entra na contagem "Agendaram" da campanha e vira anotação na ficha da pessoa.

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Megaphone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface OpcaoCampanha {
  id: string;
  nome: string;
}

/** Campanhas que a pessoa recebeu e em que ainda não consta como "agendou". */
export function useCampanhasDaPessoa(clientId: string | null | undefined): OpcaoCampanha[] {
  const [opcoes, setOpcoes] = useState<OpcaoCampanha[]>([]);
  useEffect(() => {
    let ativo = true;
    setOpcoes([]);
    if (!clientId) return;
    createClient()
      .from("campanha_envios")
      .select("campanha_id, campanhas(nome)")
      .eq("client_id", clientId)
      .not("enviado_em", "is", null)
      .neq("status", "agendou")
      .then(({ data, error }) => {
        // Sem a tabela (SQL das campanhas não rodado) ou sem permissão: o campo simplesmente não aparece.
        if (!ativo || error) return;
        setOpcoes(
          ((data ?? []) as any[]).map((e) => {
            const c = Array.isArray(e.campanhas) ? e.campanhas[0] : e.campanhas;
            return { id: e.campanha_id as string, nome: (c?.nome as string) ?? "Campanha" };
          })
        );
      });
    return () => {
      ativo = false;
    };
  }, [clientId]);
  return opcoes;
}

/** Marca a pessoa como "agendou" na campanha. Devolve a mensagem de erro, se houver. */
export async function vincularCampanha(supabase: SupabaseClient, campanhaId: string, clientId: string): Promise<string | null> {
  const { error } = await supabase.rpc("registrar_envio_campanha", {
    p_campanha: campanhaId,
    p_client: clientId,
    p_status: "agendou",
    p_mensagem: null,
  });
  return error ? error.message || "Não consegui ligar à campanha." : null;
}

export default function VinculoCampanha({
  clientId,
  valor,
  onChange,
}: {
  clientId: string | null | undefined;
  valor: string;
  onChange: (campanhaId: string) => void;
}) {
  const opcoes = useCampanhasDaPessoa(clientId);
  // Trocou de pessoa ou a campanha escolhida saiu da lista: volta para "Nenhuma".
  useEffect(() => {
    if (valor && !opcoes.some((o) => o.id === valor)) onChange("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opcoes]);
  if (!opcoes.length) return null;
  return (
    <div>
      <label className="mb-1 flex items-center gap-1 text-xs font-medium text-neutral-600">
        <Megaphone size={12} /> Veio de campanha?
      </label>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm">
        <option value="">Não, agendamento normal</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            Sim: {o.nome}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[11px] text-neutral-400">Conta como &quot;Agendou&quot; nessa campanha e fica anotado na ficha.</p>
    </div>
  );
}
