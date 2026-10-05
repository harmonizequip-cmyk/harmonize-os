"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";

const FORMAS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

/**
 * Atalho para dar baixa na taxa de reserva de um agendamento: pergunta só a
 * forma de pagamento e chama definir_taxa_agendamento(..., 'paga', forma).
 * Usado em Pendências e na Agenda, onde o aviso da taxa aparece, para o aviso
 * nunca levar a uma tela sem a ação. O valor é o da configuração (o banco
 * decide); `valor` aqui é só para mostrar.
 */
export default function TaxaRecebidaBotao({
  eventId,
  valor,
  onDone,
}: {
  eventId: string;
  valor?: number;
  onDone?: () => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState("pix");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("definir_taxa_agendamento", {
      p_event_id: eventId,
      p_status: "paga",
      p_payment_method: forma,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível registrar a taxa.");
      return;
    }
    setAberto(false);
    if (onDone) onDone();
    else router.refresh();
  }

  const rotulo = valor && valor > 0 ? `Taxa recebida (${formatCurrency(valor)})` : "Taxa recebida";

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white"
      >
        {rotulo}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-2.5">
      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
        Como a taxa{valor && valor > 0 ? ` de ${formatCurrency(valor)}` : ""} foi paga?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={forma}
          onChange={(e) => setForma(e.target.value)}
          aria-label="Forma de pagamento da taxa"
          className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
        >
          {FORMAS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
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
          onClick={() => {
            setAberto(false);
            setErro(null);
          }}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="text-xs text-red-600 dark:text-red-400">{erro}</p>}
    </div>
  );
}
