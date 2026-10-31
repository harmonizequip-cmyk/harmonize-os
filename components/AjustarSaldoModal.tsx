"use client";

// Ajustar saldo (31/10/2026): o dono informa o saldo real de hoje e a função
// ajustar_saldo lança a diferença na categoria "Ajuste de saldo" (fora do
// resultado, dentro do saldo). Abre por portal no <body>.

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, Scale } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { avisar, confirmar } from "@/components/Dialogos";
import { IconeChip } from "@/components/ui/Visual";
import { faltaSqlDoAjuste, lerSaldoInformado, previaAjuste } from "@/lib/ajuste-saldo";

export const MSG_FALTA_SQL_AJUSTE = "Falta rodar o SQL do ajuste de saldo.";

export default function AjustarSaldoModal({
  escopo,
  saldoApp,
  onFechar,
}: {
  escopo: "harmonize" | "pessoal";
  saldoApp: number;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const saldoReal = texto.trim() ? lerSaldoInformado(texto) : null;
  const previa = saldoReal == null ? null : previaAjuste(saldoApp, saldoReal);
  const pode = !!previa && previa.tipo != null && !salvando;

  async function salvar() {
    if (!previa || previa.tipo == null || saldoReal == null) return;
    const ok = await confirmar({
      titulo: `Lançar ajuste de ${formatCurrency(previa.valor)}?`,
      texto: `O saldo passa de ${formatCurrency(saldoApp)} para ${formatCurrency(saldoReal)}. O ajuste fica fora do resultado.`,
      confirmar: "Lançar ajuste",
    });
    if (!ok) return;
    setSalvando(true);
    setErro(null);
    const { data, error } = await createClient().rpc("ajustar_saldo", {
      p_scope: escopo,
      p_saldo_real: saldoReal,
      p_observacao: observacao.trim() || null,
    });
    setSalvando(false);
    if (error) {
      setErro(faltaSqlDoAjuste(error.message) ? MSG_FALTA_SQL_AJUSTE : error.message || "Não consegui lançar o ajuste.");
      return;
    }
    const r = (data ?? {}) as { diferenca?: number; saldo_real?: number };
    avisar(
      Number(r.diferenca ?? 0) === 0
        ? "O saldo já estava certo. Nada foi lançado."
        : `Saldo ajustado para ${formatCurrency(Number(r.saldo_real ?? saldoReal))}.`
    );
    onFechar();
    router.refresh();
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onFechar}>
      <div
        className="cartao w-full max-w-md rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Ajustar saldo"
      >
        <div className="flex items-center gap-3">
          <IconeChip icone={Scale} cor="teal" />
          <div>
            <p className="text-base font-bold text-neutral-900">Ajustar saldo</p>
            <p className="text-xs text-neutral-500">{escopo === "pessoal" ? "Conta pessoal" : "Caixa da Harmonize"}</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-neutral-50 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">Saldo no app</p>
          <p className={`text-lg font-extrabold tabular-nums ${saldoApp < 0 ? "text-rose-600" : "text-neutral-900"}`}>{formatCurrency(saldoApp)}</p>
        </div>

        <label className="mt-4 block text-xs font-medium text-neutral-600">Saldo real hoje</label>
        <input
          autoFocus
          inputMode="decimal"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && pode && salvar()}
          placeholder="Ex.: 4.235,83"
          className="mt-1 w-full rounded-xl px-3.5 py-3 text-base font-semibold tabular-nums ring-1 ring-neutral-300 outline-none focus:ring-2 focus:ring-brand-teal"
        />
        {texto.trim() && saldoReal == null && <p className="mt-1 text-xs text-rose-600">Não entendi o valor. Use, por exemplo, 4.235,83.</p>}

        {previa && (
          <p className="mt-3 rounded-xl bg-brand-teal/5 p-3 text-sm text-neutral-700">
            {previa.tipo == null
              ? "O saldo já bate. Não há nada para ajustar."
              : `Vai lançar um ajuste de ${formatCurrency(previa.valor)} (${previa.tipo === "entrada" ? "entrada" : "saída"}), fora do resultado.`}
          </p>
        )}

        <label className="mt-4 block text-xs font-medium text-neutral-600">Observação (opcional)</label>
        <input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          maxLength={300}
          placeholder="Ex.: conferido no extrato do banco"
          className="mt-1 w-full rounded-xl px-3.5 py-2.5 text-sm ring-1 ring-neutral-300 outline-none focus:ring-2 focus:ring-brand-teal"
        />

        {erro && <p className="mt-3 text-sm text-rose-600">{erro}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button onClick={onFechar} className="rounded-2xl py-3 text-sm font-semibold text-neutral-700 ring-1 ring-neutral-300">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={!pode}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-brand-gradient py-3 text-sm font-bold text-white disabled:opacity-40"
          >
            {salvando && <Loader2 size={16} className="animate-spin" />} Confirmar
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
