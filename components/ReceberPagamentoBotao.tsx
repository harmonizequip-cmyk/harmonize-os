"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PIX_CONTAS } from "@/lib/rental-calculator";
import { formatCurrency } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { valorParaNumero, numeroParaCampo } from "@/lib/valor";

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

/**
 * Atalho único para receber o saldo de uma locação, usado em todas as telas
 * onde aparece dívida (Pendências, Locações, Agenda, ficha do cliente...).
 * Valor já vem preenchido com o saldo; pode ser menor (pagamento parcial).
 * Quem decide o que é aceito é o banco (registrar_pagamento_locacao): aqui só
 * se evita o erro óbvio de valor zero ou acima do saldo.
 */
export default function ReceberPagamentoBotao({
  rentalId,
  saldo,
  rotulo,
  onDone,
}: {
  rentalId: string;
  saldo: number;
  rotulo?: string;
  onDone?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState("");
  const [forma, setForma] = useState("pix");
  const [conta, setConta] = useState("harmonize");
  const [data, setData] = useState(hojeLocal());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function abrir() {
    setValor(numeroParaCampo(saldo));
    setForma("pix");
    setConta("harmonize");
    setData(hojeLocal());
    setErro(null);
    setAberto(true);
  }

  async function confirmar() {
    const v = valorParaNumero(valor);
    if (!Number.isFinite(v) || v <= 0) {
      setErro("Informe um valor válido.");
      return;
    }
    if (v > saldo + 0.001) {
      setErro(`O valor é maior que o saldo em aberto (${formatCurrency(saldo)}).`);
      return;
    }
    if (!data) {
      setErro("Informe a data em que o dinheiro entrou.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("registrar_pagamento_locacao", {
      p_rental_id: rentalId,
      p_forma: forma,
      p_valor: v,
      p_data: data,
      p_pix_conta: forma === "pix" ? conta : null,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível registrar o pagamento.");
      return;
    }
    setAberto(false);
    if (onDone) onDone();
    else router.refresh();
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={abrir}
        className="w-full rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white"
      >
        {rotulo ?? `Receber (${formatCurrency(saldo)})`}
      </button>
    );
  }

  const campo =
    "rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
  return (
    <div className="space-y-2 rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-2.5">
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
        Saldo em aberto: {formatCurrency(saldo)}. Pode lançar menos, se o pagamento for parcial.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          inputMode="decimal"
          aria-label="Valor recebido"
          className={`w-28 ${campo}`}
        />
        <select value={forma} onChange={(e) => setForma(e.target.value)} aria-label="Forma de pagamento" className={campo}>
          {FORMAS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        {forma === "pix" && (
          <select
            value={conta}
            onChange={(e) => setConta(e.target.value)}
            aria-label="Conta PIX que recebeu"
            className={`min-w-0 flex-1 ${campo}`}
          >
            {PIX_CONTAS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          aria-label="Data em que entrou"
          className={campo}
        />
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={salvando}
          onClick={confirmar}
          className="flex-1 rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {salvando ? "Salvando..." : "Confirmar recebimento"}
        </button>
        <button
          type="button"
          disabled={salvando}
          onClick={() => setAberto(false)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
