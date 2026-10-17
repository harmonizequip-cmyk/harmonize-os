"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { avisar, confirmar as confirmarDialogo } from "@/components/Dialogos";

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
  isentar = true,
}: {
  eventId: string;
  valor?: number;
  onDone?: () => void;
  /** Mostra "Isentar taxa" (não cobrar esta reserva). Ligado em toda tela da taxa. */
  isentar?: boolean;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState("pix");
  // Dia em que o dinheiro entrou (a taxa entra no caixa nesse dia, não na data
  // da reserva nem do fechamento dos disparos).
  const [data, setData] = useState(hojeLocal());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    if (!data) {
      setErro("Informe o dia em que o dinheiro entrou.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("definir_taxa_agendamento", {
      p_event_id: eventId,
      p_status: "paga",
      p_payment_method: forma,
      p_data: data,
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

  // Isenta só esta reserva (clientes antigos que nunca pagaram a taxa, por
  // exemplo). Só aparece com a taxa pendente, então nunca mexe em taxa paga.
  async function isentarTaxa() {
    const ok = await confirmarDialogo({
      titulo: "Isentar a taxa desta reserva?",
      texto: 'A cobrança some e a reserva segue sem taxa. Para voltar a cobrar, use "Cobrar taxa" no agendamento, na ficha da cliente.',
      confirmar: "Isentar taxa",
    });
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc("definir_taxa_agendamento", {
      p_event_id: eventId,
      p_status: "nao_aplica",
      p_payment_method: "pix",
    });
    setSalvando(false);
    if (error) {
      setErro(error.message || "Não foi possível isentar a taxa.");
      return;
    }
    avisar("Taxa isentada.");
    if (onDone) onDone();
    else router.refresh();
  }

  const rotulo = valor && valor > 0 ? `Taxa recebida (${formatCurrency(valor)})` : "Taxa recebida";

  if (!aberto) {
    return (
      <div className="space-y-1.5">
        <button
          type="button"
          onClick={() => {
            setData(hojeLocal());
            setAberto(true);
          }}
          className="w-full rounded-lg bg-brand-teal py-1.5 text-xs font-medium text-white"
        >
          {rotulo}
        </button>
        {isentar && (
          <button
            type="button"
            disabled={salvando}
            onClick={isentarTaxa}
            className="w-full rounded-lg border border-neutral-300 bg-white py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Isentar taxa"}
          </button>
        )}
        {erro && <p className="text-xs text-red-600">{erro}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand-teal/40 bg-brand-teal/5 p-2.5">
      <p className="text-[11px] text-neutral-500">
        Como a taxa{valor && valor > 0 ? ` de ${formatCurrency(valor)}` : ""} foi paga?
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={forma}
          onChange={(e) => setForma(e.target.value)}
          aria-label="Forma de pagamento da taxa"
          className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
        >
          {FORMAS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={data}
          onChange={(e) => setData(e.target.value)}
          aria-label="Dia em que o dinheiro entrou"
          className="rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
        />
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
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600"
        >
          Cancelar
        </button>
      </div>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
    </div>
  );
}
