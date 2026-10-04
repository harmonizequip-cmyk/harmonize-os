"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { hojeLocal, somarDias } from "@/lib/period";

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

interface Despesa {
  id: string;
  description: string;
  amount: number;
  date: string;
  categoria: string | null;
  cliente: string | null;
}

// Janela, em dias em torno da data da reserva, em que uma despesa avulsa é
// oferecida para vincular.
const JANELA_AVULSAS = 15;

function paraDespesa(t: any): Despesa {
  const cat = Array.isArray(t.categories) ? t.categories[0] : t.categories;
  const cli = Array.isArray(t.clients) ? t.clients[0] : t.clients;
  return {
    id: t.id,
    description: t.description,
    amount: Number(t.amount),
    date: t.date,
    categoria: cat?.name ?? null,
    cliente: cli?.name ?? null,
  };
}

// Despesas de uma reserva que ainda não tem disparos (combustível,
// estacionamento, alimentação do dia). Ficam guardadas na reserva e, ao
// finalizar com os disparos, o banco passa todas para a locação criada
// (gatilho calendar_events_amarra_despesas). Também permite puxar para cá
// uma despesa que foi lançada solta no Financeiro.
export default function DespesasDaReserva({
  eventId,
  clientId,
  dataEvento,
}: {
  eventId: string;
  clientId: string | null;
  dataEvento: string;
}) {
  const supabase = createClient();
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [avulsas, setAvulsas] = useState<Despesa[]>([]);
  const [categorias, setCategorias] = useState<{ id: string; name: string }[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarAvulsas, setMostrarAvulsas] = useState(false);

  const [categoriaId, setCategoriaId] = useState("");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [forma, setForma] = useState("pix");
  const [data, setData] = useState(() => hojeLocal());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    const campos = "id, description, amount, date, categories(name), clients(name)";
    let consultaAvulsas = supabase
      .from("transactions")
      .select(campos)
      .eq("type", "saida")
      .eq("scope", "harmonize")
      .eq("is_test", false)
      .is("rental_id", null)
      .is("calendar_event_id", null)
      .gte("date", somarDias(dataEvento, -JANELA_AVULSAS))
      .lte("date", somarDias(dataEvento, JANELA_AVULSAS))
      .order("date", { ascending: false })
      .limit(50);
    // Só despesa deste cliente ou sem cliente nenhum: despesa de outro
    // cliente não é candidata.
    consultaAvulsas = clientId
      ? consultaAvulsas.or(`client_id.eq.${clientId},client_id.is.null`)
      : consultaAvulsas.is("client_id", null);

    const [daReserva, soltas, cats] = await Promise.all([
      supabase
        .from("transactions")
        .select(campos)
        .eq("calendar_event_id", eventId)
        .eq("type", "saida")
        .order("date", { ascending: false }),
      consultaAvulsas,
      supabase.from("categories").select("id, name").eq("type", "saida").eq("scope", "harmonize").order("name"),
    ]);
    setDespesas((daReserva.data ?? []).map(paraDespesa));
    setAvulsas((soltas.data ?? []).map(paraDespesa));
    setCategorias(cats.data ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  async function lancar() {
    const numero = Number(valor.replace(",", "."));
    if (!categoriaId || !numero || numero <= 0) {
      setErro("Escolha a categoria e informe um valor válido.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_despesa_reserva", {
      p_event_id: eventId,
      p_category_id: categoriaId,
      p_amount: numero,
      p_payment_method: forma,
      p_date: data,
      p_description: descricao.trim() || categorias.find((c) => c.id === categoriaId)?.name || null,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível lançar a despesa.");
      return;
    }
    setValor("");
    setDescricao("");
    await carregar();
  }

  async function vincular(id: string) {
    setErro(null);
    const { error } = await supabase
      .from("transactions")
      .update({ calendar_event_id: eventId, ...(clientId ? { client_id: clientId } : {}) })
      .eq("id", id);
    if (error) {
      setErro("Não foi possível vincular a despesa.");
      return;
    }
    await carregar();
  }

  async function desvincular(id: string) {
    setErro(null);
    const { error } = await supabase.from("transactions").update({ calendar_event_id: null }).eq("id", id);
    if (error) {
      setErro("Não foi possível desvincular a despesa.");
      return;
    }
    await carregar();
  }

  const total = despesas.reduce((s, d) => s + d.amount, 0);
  const campo =
    "rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  return (
    <div className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Despesas desta reserva</p>
        {total > 0 && <p className="text-xs font-semibold text-brand-pink">{formatCurrency(total)}</p>}
      </div>
      <p className="mt-0.5 text-[11px] text-neutral-400">
        Ao finalizar com os disparos, estas despesas passam sozinhas para a locação e entram no lucro dela.
      </p>

      {carregando ? (
        <p className="mt-2 text-xs text-neutral-400">Carregando...</p>
      ) : (
        <>
          {despesas.length > 0 && (
            <ul className="mt-2 space-y-1">
              {despesas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-300">
                    {formatDate(d.date)} · {d.categoria ?? d.description}
                    {d.categoria && d.description !== d.categoria ? ` · ${d.description}` : ""}
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <span className="font-medium text-neutral-800 dark:text-neutral-100">{formatCurrency(d.amount)}</span>
                    <button type="button" onClick={() => desvincular(d.id)} className="text-[11px] text-neutral-400 underline">
                      desvincular
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={`${campo} col-span-2`}>
              <option value="">Categoria da despesa</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))}
              placeholder="Valor (R$)"
              className={campo}
            />
            <select value={forma} onChange={(e) => setForma(e.target.value)} className={campo}>
              {FORMAS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descrição (opcional)"
              className={campo}
            />
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={campo} />
          </div>
          <button
            type="button"
            onClick={lancar}
            disabled={salvando}
            className="mt-2 w-full rounded-lg border border-brand-pink py-2 text-xs font-medium text-brand-pink disabled:opacity-60"
          >
            {salvando ? "Lançando..." : "Lançar despesa nesta reserva"}
          </button>

          {avulsas.length > 0 && (
            <div className="mt-3 border-t border-neutral-200 pt-2 dark:border-neutral-700">
              <button
                type="button"
                onClick={() => setMostrarAvulsas((v) => !v)}
                className="text-xs text-brand-teal underline underline-offset-2"
              >
                {mostrarAvulsas ? "Ocultar" : "Vincular"} despesa avulsa já lançada ({avulsas.length})
              </button>
              {mostrarAvulsas && (
                <ul className="mt-2 space-y-1">
                  {avulsas.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-400">
                        {formatDate(d.date)} · {d.categoria ?? "-"} · {d.description}
                        {d.cliente ? "" : " · sem cliente"}
                      </span>
                      <span className="flex flex-shrink-0 items-center gap-2">
                        <span className="font-medium text-neutral-800 dark:text-neutral-100">{formatCurrency(d.amount)}</span>
                        <button
                          type="button"
                          onClick={() => vincular(d.id)}
                          className="rounded border border-brand-teal px-1.5 py-0.5 text-[11px] font-medium text-brand-teal"
                        >
                          Vincular
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
