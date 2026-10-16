"use client";

import { useRouter } from "next/navigation";
import SeletorPlanejamento from "@/components/SeletorPlanejamento";
import { CHAVE_PLANO_IA, linkNovoPlanejamento } from "@/lib/atalhos";
import type { EscolhaAreas } from "@/lib/assistente";

// O seletor monta o planejamento pelas regras e abre no planejador; "Pedir
// ajuste à IA" devolve a escolha para o assistente redistribuir.
export default function CartaoEscolhaAreas({
  escolha,
  clienteId,
  onPedir,
}: {
  escolha: EscolhaAreas;
  clienteId?: string | null;
  onPedir: (texto: string) => void;
}) {
  const router = useRouter();
  return (
    <div className="mt-2 rounded-xl border border-brand-teal/30 bg-brand-teal/5 p-3">
      <SeletorPlanejamento
        marcadas={escolha.marcadas}
        saldoInicial={escolha.saldo}
        queixaInicial={escolha.queixa}
        paciente={escolha.paciente}
        textoAplicar="Abrir no planejador"
        onAplicar={(m) => {
          try {
            sessionStorage.setItem(CHAVE_PLANO_IA, JSON.stringify(m.estado));
          } catch {
            // sem sessão: abre o planejador vazio
          }
          const base = linkNovoPlanejamento(clienteId ?? null);
          router.push(base + (base.includes("?") ? "&" : "?") + "ia=1");
        }}
        onPedirIA={onPedir}
      />
    </div>
  );
}
