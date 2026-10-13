"use client";

// Ajuda de custo do deslocamento de uma reserva (ainda sem locação). O
// mesmo campo da janela da reserva na Agenda, para lançar também pelo
// cartão do Funil e pela ficha. Ao finalizar, o valor segue para a locação.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { valorParaNumero } from "@/lib/valor";

export default function AjudaCustoReserva({ eventId }: { eventId: string }) {
  const supabase = createClient();
  const [carregando, setCarregando] = useState(true);
  const [valor, setValor] = useState("");
  const [km, setKm] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let ativo = true;
    supabase
      .from("calendar_events")
      .select("km_ida, valor_deslocamento")
      .eq("id", eventId)
      .single()
      .then(({ data }) => {
        if (!ativo) return;
        setCarregando(false);
        if (data) {
          setKm(data.km_ida ? String(data.km_ida) : "");
          setValor(data.valor_deslocamento ? String(data.valor_deslocamento).replace(".", ",") : "");
        }
      });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setOk(false);
    const kmNumero = Number(km.replace(/\D/g, "")) || 0;
    const { error } = await supabase.rpc("definir_deslocamento_reserva", {
      p_event_id: eventId,
      p_km_ida: kmNumero > 0 ? kmNumero : null,
      p_valor_deslocamento: valorParaNumero(valor) || 0,
    });
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar o deslocamento. Tente novamente.");
      return;
    }
    setOk(true);
  }

  return (
    <div className="mt-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        Ajuda de custo: deslocamento (opcional)
      </label>
      {carregando ? (
        <p className="text-xs text-neutral-400">Carregando...</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">R$</span>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value.replace(/[^\d,]/g, ""));
                setOk(false);
              }}
              placeholder="0,00"
              className="w-24 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <span className="text-xs text-neutral-500">km ida</span>
            <input
              inputMode="numeric"
              value={km}
              onChange={(e) => {
                setKm(e.target.value.replace(/\D/g, ""));
                setOk(false);
              }}
              placeholder="0"
              className="w-16 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-neutral-400">
            Valor que o cliente paga pelo deslocamento, à parte da locação. Ao finalizar, segue junto para a locação.
            O km é só registro.
          </p>
          {ok && <p className="mt-1 text-xs text-brand-teal">Salvo.</p>}
        </>
      )}
      {erro && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
