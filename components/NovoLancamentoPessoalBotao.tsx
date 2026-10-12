"use client";

// Botão "+ Novo lançamento" do espaço Pessoal: abre o mesmo formulário do
// Financeiro já com "Conta pessoal" marcada.

import { useState } from "react";
import { useRouter } from "next/navigation";
import NovoLancamentoModal from "@/app/(app)/financeiro/NovoLancamentoModal";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

export default function NovoLancamentoPessoalBotao({
  categorias,
  clientes,
}: {
  categorias: { id: string; name: string; type: "entrada" | "saida" }[];
  clientes: { id: string; name: string }[];
}) {
  const router = useRouter();
  const somenteLeitura = useSomenteLeitura();
  const [aberto, setAberto] = useState(false);
  if (somenteLeitura) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal"
      >
        + Novo lançamento
      </button>
      {aberto && (
        <NovoLancamentoModal
          categories={categorias}
          clients={clientes}
          escopoInicial="pessoal"
          onClose={() => setAberto(false)}
          onCreated={() => {
            setAberto(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
