"use client";

import { useRouter } from "next/navigation";
import type { PlanejamentoIA } from "@/lib/assistente";
import { CHAVE_PLANO_IA, linkNovoPlanejamento } from "@/lib/atalhos";
import { ClipboardList } from "lucide-react";

const fmt = (n: number) => Number(n || 0).toLocaleString("pt-BR");

// Planejamento montado pela IA: resumo por área e o botão que abre o
// Planejador HIPRO já preenchido (o estado vai pela sessão do navegador).
export default function CartaoPlanejamento({ plano }: { plano: PlanejamentoIA }) {
  const router = useRouter();
  const passou = plano.saldo > 0 && plano.total > plano.saldo;
  // Várias sessões: o saldo do plano é o do pacote; o que não foi distribuído fica para a próxima.
  const sessoes = Math.max(1, Number(plano.estado?.sessoesTotal) || 1);
  const pacote = Number(plano.estado?.saldoTotal) || 0;
  const restam = Math.max(0, pacote - plano.total);

  function abrir() {
    try {
      sessionStorage.setItem(CHAVE_PLANO_IA, JSON.stringify(plano.estado));
    } catch {
      // sem sessão: abre o planejador sem os disparos
    }
    const base = linkNovoPlanejamento(plano.client_id, plano.calendar_event_id);
    router.push(base + (base.includes("?") ? "&" : "?") + "ia=1");
  }

  return (
    <div className="mt-2 rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-teal-dark">
          <ClipboardList size={14} /> Planejamento {plano.paciente ? `de ${plano.paciente}` : ""}
          {plano.cliente_nome ? ` · ${plano.cliente_nome}` : ""}
        </p>
        <p className={`flex-shrink-0 font-mono text-xs font-semibold ${passou ? "text-rose-600" : "text-brand-teal-dark"}`}>
          {fmt(plano.total)} / {fmt(plano.saldo)}
        </p>
      </div>
      {sessoes > 1 && (
        <p className="mt-1 text-xs font-semibold text-brand-teal-dark">
          Sessão 1 de {sessoes}, restam {fmt(restam)} para a próxima
        </p>
      )}
      <div className="mt-2 space-y-1">
        {plano.resumo.map((r) => (
          <div key={r.area} className="flex items-center gap-2 text-xs text-neutral-700">
            <span className="w-32 flex-shrink-0 truncate">{r.area}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white">
              <span
                className="block h-full rounded-full bg-brand-teal"
                style={{ width: `${plano.total ? Math.max(4, (r.total / plano.total) * 100) : 0}%` }}
              />
            </span>
            <span className="w-14 flex-shrink-0 text-right font-mono">{fmt(r.total)}</span>
          </div>
        ))}
      </div>
      <button
        onClick={abrir}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-2.5 text-sm font-semibold text-white"
      >
        <ClipboardList size={15} /> Abrir no planejador
      </button>
    </div>
  );
}
