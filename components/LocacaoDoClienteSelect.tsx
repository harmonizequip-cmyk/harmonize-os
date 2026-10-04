"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";

// A que a despesa está ligada: a uma locação já lançada, a uma reserva que
// ainda não tem disparos, ou a nada (os dois nulos).
export interface VinculoDespesa {
  rentalId: string | null;
  eventId: string | null;
}

export const SEM_VINCULO: VinculoDespesa = { rentalId: null, eventId: null };

interface Opcao {
  tipo: "locacao" | "reserva";
  id: string;
  data: string;
  equipamento: string | null;
  valor: number | null;
}

// Diferença em dias entre duas datas "YYYY-MM-DD", sem passar por fuso.
function distanciaEmDias(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000));
}

function nomeDoEquipamento(rel: any): string | null {
  return (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? null;
}

// Até quantos dias de distância uma locação/reserva é sugerida sozinha
// para a despesa. Além disso, a escolha fica com quem lança.
const JANELA_SUGESTAO = 15;

// Liga uma despesa a uma locação ou a uma reserva do cliente escolhido.
// Sem isso a despesa fica presa só ao cliente e não aparece no lucro de
// locação nenhuma (rentals_lucro soma por transactions.rental_id).
//
// Reserva entra na lista porque a despesa costuma acontecer no dia do
// atendimento, antes de os disparos serem lançados: ela fica na reserva e,
// ao finalizar, o banco passa a despesa para a locação sozinho.
//
// Com `sugerir`, a opção mais próxima da data da despesa já vem
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
  value: VinculoDespesa;
  onChange: (vinculo: VinculoDespesa) => void;
  dataReferencia: string;
  sugerir: boolean;
}) {
  const supabase = createClient();
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);
  const sugeridoPara = useRef<string | null>(null);

  useEffect(() => {
    let ativo = true;
    setOpcoes(null);
    Promise.all([
      supabase
        .from("rentals")
        .select("id, event_date, calculated_value, equipments(name)")
        .eq("client_id", clientId)
        .neq("status", "cancelada")
        .order("event_date", { ascending: false })
        .limit(100),
      supabase
        .from("calendar_events")
        .select("id, date_start, equipments(name)")
        .eq("client_id", clientId)
        .is("rental_id", null)
        .neq("status", "cancelada")
        .not("equipment_id", "is", null)
        .order("date_start", { ascending: false })
        .limit(50),
    ]).then(([locacoes, reservas]) => {
      if (!ativo) return;
      const lista: Opcao[] = [
        ...(reservas.data ?? []).map(
          (e: any): Opcao => ({
            tipo: "reserva",
            id: e.id,
            data: e.date_start,
            equipamento: nomeDoEquipamento(e.equipments),
            valor: null,
          })
        ),
        ...(locacoes.data ?? []).map(
          (r: any): Opcao => ({
            tipo: "locacao",
            id: r.id,
            data: r.event_date,
            equipamento: nomeDoEquipamento(r.equipments),
            valor: Number(r.calculated_value),
          })
        ),
      ];
      setOpcoes(lista);

      const semVinculo = !value.rentalId && !value.eventId;
      if (sugerir && semVinculo && sugeridoPara.current !== clientId && dataReferencia) {
        sugeridoPara.current = clientId;
        let melhor: Opcao | null = null;
        for (const o of lista) {
          const d = distanciaEmDias(o.data, dataReferencia);
          if (d <= JANELA_SUGESTAO && (!melhor || d < distanciaEmDias(melhor.data, dataReferencia))) melhor = o;
        }
        if (melhor) {
          onChange(melhor.tipo === "locacao" ? { rentalId: melhor.id, eventId: null } : { rentalId: null, eventId: melhor.id });
        }
      }
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const chave = value.rentalId ? `L:${value.rentalId}` : value.eventId ? `R:${value.eventId}` : "";
  const reservas = (opcoes ?? []).filter((o) => o.tipo === "reserva");
  const locacoes = (opcoes ?? []).filter((o) => o.tipo === "locacao");
  const foraDaLista =
    !!chave &&
    opcoes !== null &&
    !opcoes.some((o) => (o.tipo === "locacao" ? `L:${o.id}` : `R:${o.id}`) === chave);

  function escolher(novaChave: string) {
    if (!novaChave) return onChange(SEM_VINCULO);
    const id = novaChave.slice(2);
    onChange(novaChave.startsWith("L:") ? { rentalId: id, eventId: null } : { rentalId: null, eventId: id });
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Locação ou reserva deste cliente
      </label>
      {opcoes === null ? (
        <p className="text-xs text-neutral-400">Carregando locações...</p>
      ) : opcoes.length === 0 && !foraDaLista ? (
        <p className="rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
          Este cliente ainda não tem reserva nem locação. A despesa fica ligada só ao cliente; quando houver uma
          reserva, edite este lançamento para ligar os dois.
        </p>
      ) : (
        <>
          <select
            value={chave}
            onChange={(e) => escolher(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          >
            <option value="">Nenhuma (despesa avulsa do cliente)</option>
            {foraDaLista && <option value={chave}>Vínculo atual (cancelado ou antigo)</option>}
            {reservas.length > 0 && (
              <optgroup label="Reservas ainda sem disparos">
                {reservas.map((o) => (
                  <option key={o.id} value={`R:${o.id}`}>
                    {formatDate(o.data)}
                    {o.equipamento ? ` · ${o.equipamento}` : ""} · reserva
                  </option>
                ))}
              </optgroup>
            )}
            {locacoes.length > 0 && (
              <optgroup label="Locações lançadas">
                {locacoes.map((o) => (
                  <option key={o.id} value={`L:${o.id}`}>
                    {formatDate(o.data)}
                    {o.equipamento ? ` · ${o.equipamento}` : ""} · {formatCurrency(o.valor ?? 0)}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <p className="mt-1 text-[11px] text-neutral-400">
            {value.rentalId
              ? "A despesa entra no custo desta locação e no lucro dela."
              : value.eventId
                ? "A despesa fica na reserva e passa sozinha para a locação quando você finalizar com os disparos."
                : "Sem vínculo, a despesa não entra no lucro de nenhuma locação."}
          </p>
        </>
      )}
    </div>
  );
}
