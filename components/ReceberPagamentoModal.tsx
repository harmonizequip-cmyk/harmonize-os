"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import ReceberPagamentoBotao from "./ReceberPagamentoBotao";
import TaxaRecebidaBotao from "./TaxaRecebidaBotao";

interface Aluguel {
  id: string;
  cliente: string;
  equipamento: string | null;
  periodo: string;
  saldo: number;
  totalPago: number;
  vencido: boolean;
}

interface Taxa {
  id: string;
  cliente: string;
  dataEvento: string;
  valor: number;
}

const LOTE = 100;

function um<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/**
 * Janela do botão "+" para receber dinheiro sem sair da tela onde se está:
 * aba Aluguel (quitar tudo ou abater parte do saldo de qualquer locação com
 * saldo, vencida ou ainda por vir) e aba Taxa de reserva (baixa da taxa
 * pendente). Os botões são os mesmos usados em Pendências, Locações e Agenda.
 */
export default function ReceberPagamentoModal({ onClose }: { onClose: () => void }) {
  const supabase = createClient();
  const router = useRouter();
  const [aba, setAba] = useState<"aluguel" | "taxa">("aluguel");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [alugueis, setAlugueis] = useState<Aluguel[]>([]);
  const [taxas, setTaxas] = useState<Taxa[]>([]);
  const [busca, setBusca] = useState("");

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const hoje = hojeLocal();

    const [locRes, taxaRes] = await Promise.all([
      supabase
        .from("rentals")
        .select("id, event_date, event_date_end, clients(name), equipments(name)")
        .eq("is_test", false)
        .neq("status", "cancelada")
        .eq("pago", false)
        .order("event_date", { ascending: false })
        .limit(300),
      supabase
        .from("calendar_events")
        .select("id, date_start, taxa_valor, clients(name)")
        .eq("is_test", false)
        .eq("taxa_status", "pendente")
        .neq("status", "cancelada")
        .not("equipment_id", "is", null)
        .gte("date_start", hoje)
        .order("date_start", { ascending: true })
        .limit(200),
    ]);

    if (locRes.error || taxaRes.error) {
      setErro("Não consegui carregar a lista. Confira a conexão e tente de novo.");
      setCarregando(false);
      return;
    }

    const locs = (locRes.data ?? []) as any[];
    const saldos = new Map<string, { saldo: number; totalPago: number }>();
    for (let i = 0; i < locs.length; i += LOTE) {
      const ids = locs.slice(i, i + LOTE).map((r) => r.id);
      const { data, error } = await supabase
        .from("rentals_situacao_pagamento")
        .select("rental_id, saldo, total_pago")
        .in("rental_id", ids);
      if (error) {
        setErro("Não consegui carregar os saldos. Confira a conexão e tente de novo.");
        setCarregando(false);
        return;
      }
      for (const s of data ?? []) {
        saldos.set((s as any).rental_id, { saldo: Number((s as any).saldo), totalPago: Number((s as any).total_pago) });
      }
    }

    setAlugueis(
      locs
        .map((r) => {
          const s = saldos.get(r.id);
          const fim = r.event_date_end ?? r.event_date;
          return {
            id: r.id as string,
            cliente: um<any>(r.clients)?.name ?? "Sem nome",
            equipamento: um<any>(r.equipments)?.name ?? null,
            periodo:
              r.event_date_end && r.event_date_end !== r.event_date
                ? `${formatDate(r.event_date)} a ${formatDate(r.event_date_end)}`
                : formatDate(r.event_date),
            saldo: s?.saldo ?? 0,
            totalPago: s?.totalPago ?? 0,
            vencido: fim < hoje,
          };
        })
        .filter((a) => a.saldo > 0.009)
        // Vencidas primeiro, depois as que ainda vão acontecer.
        .sort((a, b) => Number(b.vencido) - Number(a.vencido))
    );
    setTaxas(
      ((taxaRes.data ?? []) as any[]).map((e) => ({
        id: e.id as string,
        cliente: um<any>(e.clients)?.name ?? "Sem nome",
        dataEvento: e.date_start as string,
        valor: Number(e.taxa_valor ?? 0),
      }))
    );
    setCarregando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const termo = busca.trim().toLowerCase();
  const alugueisVistos = useMemo(
    () => alugueis.filter((a) => !termo || a.cliente.toLowerCase().includes(termo)),
    [alugueis, termo]
  );
  const taxasVistas = useMemo(
    () => taxas.filter((t) => !termo || t.cliente.toLowerCase().includes(termo)),
    [taxas, termo]
  );

  function aoReceber() {
    carregar();
    router.refresh();
  }

  const abaClasse = (ativa: boolean) =>
    `flex-1 rounded-lg py-2 text-sm font-medium ${
      ativa ? "bg-brand-teal text-white" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
    }`;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">Receber pagamento</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-neutral-400">
            <X size={20} />
          </button>
        </div>

        <div className="mb-3 flex gap-2">
          <button className={abaClasse(aba === "aluguel")} onClick={() => setAba("aluguel")}>
            Aluguel ({alugueis.length})
          </button>
          <button className={abaClasse(aba === "taxa")} onClick={() => setAba("taxa")}>
            Taxa de reserva ({taxas.length})
          </button>
        </div>

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar cliente..."
          className="mb-3 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        />

        {erro && (
          <div className="mb-3 space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-400">
            <p>{erro}</p>
            <button onClick={carregar} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white">
              Tentar de novo
            </button>
          </div>
        )}
        {carregando && !erro && <p className="py-4 text-center text-sm text-neutral-400">Carregando...</p>}

        {!carregando && !erro && aba === "aluguel" && (
          <div className="space-y-2">
            {alugueisVistos.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral-400">
                {alugueis.length === 0 ? "Nenhuma locação com saldo em aberto. 🎉" : "Nenhum cliente encontrado."}
              </p>
            )}
            {alugueisVistos.map((a) => (
              <div key={a.id} className="space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {a.cliente}
                  </p>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(a.saldo)}</p>
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  {a.equipamento ? `${a.equipamento} · ` : ""}
                  {a.periodo}
                  {a.vencido ? " · já aconteceu" : " · ainda por vir"}
                  {a.totalPago > 0 ? ` · já recebido ${formatCurrency(a.totalPago)}` : ""}
                </p>
                <ReceberPagamentoBotao rentalId={a.id} saldo={a.saldo} rotulo="Receber (quitar ou abater)" onDone={aoReceber} />
              </div>
            ))}
          </div>
        )}

        {!carregando && !erro && aba === "taxa" && (
          <div className="space-y-2">
            {taxasVistas.length === 0 && (
              <p className="py-4 text-center text-sm text-neutral-400">
                {taxas.length === 0 ? "Nenhuma taxa de reserva pendente. 🎉" : "Nenhum cliente encontrado."}
              </p>
            )}
            {taxasVistas.map((t) => (
              <div key={t.id} className="space-y-2 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                    {t.cliente}
                  </p>
                  {t.valor > 0 && <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(t.valor)}</p>}
                </div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Reserva para {formatDate(t.dataEvento)}</p>
                <TaxaRecebidaBotao eventId={t.id} valor={t.valor} onDone={aoReceber} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
