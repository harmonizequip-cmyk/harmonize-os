"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

interface LocacaoOpcao {
  id: string;
  event_date: string;
  calculated_value: number;
  equipamento: string | null;
}

// Diferença em dias entre duas datas "YYYY-MM-DD", sem passar por fuso.
function distanciaEmDias(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000));
}

// Até quantos dias de distância uma locação é sugerida sozinha para a
// despesa. Além disso, a escolha fica com quem lança.
const JANELA_SUGESTAO = 15;

// Liga uma despesa a uma locação do cliente escolhido. Sem isso a despesa
// fica presa só ao cliente e não aparece na locação nem no lucro dela
// (rentals_lucro soma por transactions.rental_id).
//
// Com `sugerir`, a locação mais próxima da data da despesa já vem
// selecionada (uma vez por cliente), sempre à vista e trocável. Na edição
// de um lançamento antigo isso fica desligado, para abrir e salvar por
// outro motivo não criar um vínculo que ninguém escolheu.
export default function LocacaoDoClienteSelect({
  clientId,
  value,
  onChange,
  dataReferencia,
  sugerir,
}: {
  clientId: string;
  value: string | null;
  onChange: (rentalId: string | null) => void;
  dataReferencia: string;
  sugerir: boolean;
}) {
  const supabase = createClient();
  const [opcoes, setOpcoes] = useState<LocacaoOpcao[] | null>(null);
  const sugeridoPara = useRef<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setOpcoes(null);
    supabase
      .from("rentals")
      .select("id, event_date, calculated_value, equipments(name)")
      .eq("client_id", clientId)
      .neq("status", "cancelada")
      .order("event_date", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!ativo) return;
        const lista: LocacaoOpcao[] = (data ?? []).map((r: any) => ({
          id: r.id,
          event_date: r.event_date,
          calculated_value: Number(r.calculated_value),
          equipamento: (Array.isArray(r.equipments) ? r.equipments[0]?.name : r.equipments?.name) ?? null,
        }));
        setOpcoes(lista);

        if (sugerir && !value && sugeridoPara.current !== clientId && dataReferencia) {
          sugeridoPara.current = clientId;
          let melhor: LocacaoOpcao | null = null;
          for (const l of lista) {
            const d = distanciaEmDias(l.event_date, dataReferencia);
            if (d <= JANELA_SUGESTAO && (!melhor || d < distanciaEmDias(melhor.event_date, dataReferencia))) melhor = l;
          }
          if (melhor) onChange(melhor.id);
        }
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const selecionadaForaDaLista = !!value && opcoes !== null && !opcoes.some((o) => o.id === value);

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Locação deste cliente
      </label>
      {opcoes === null ? (
        <p className="text-xs text-neutral-400">Carregando locações...</p>
      ) : opcoes.length === 0 && !selecionadaForaDaLista ? (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          Este cliente ainda não tem locação lançada. A despesa fica ligada só ao cliente; depois que a locação
          existir, edite este lançamento para ligar os dois.
        </p>
      ) : (
        <>
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="">Nenhuma (despesa avulsa do cliente)</option>
            {selecionadaForaDaLista && <option value={value!}>Locação já vinculada (cancelada ou antiga)</option>}
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>
                {formatDate(o.event_date)}
                {o.equipamento ? ` · ${o.equipamento}` : ""} · {formatCurrency(o.calculated_value)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-neutral-400">
            {value
              ? "A despesa entra no custo desta locação e no lucro dela."
              : "Sem locação escolhida, a despesa não entra no lucro de nenhuma locação."}
          </p>
        </>
      )}
    </div>
  );
}
