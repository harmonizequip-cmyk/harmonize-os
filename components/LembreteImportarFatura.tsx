"use client";

// Balão flutuante que lembra de importar a fatura do cartão (OFX do Nubank)
// depois do fechamento. Só para cartão que já usa importação; some quando a
// importação é feita depois do dia do fechamento (regra em lib/lembrete-fatura.ts).
// "Depois" esconde até o dia seguinte (localStorage). É lembrete, não lista:
// se a carga falhar, não mostra nada.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileUp, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { hojeLocal } from "@/lib/period";
import { carregarLembretesFatura } from "@/lib/carregar-lembrete-fatura";
import { diaMes, linkImportarFatura, type LembreteFatura } from "@/lib/lembrete-fatura";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { IconeChip } from "@/components/ui/Visual";

const CHAVE_ADIADO = "harmonize-lembrete-fatura-adiado";

function adiadoHoje(): boolean {
  try {
    return localStorage.getItem(CHAVE_ADIADO) === hojeLocal();
  } catch {
    return false;
  }
}

export default function LembreteImportarFatura() {
  const pathname = usePathname();
  const somenteLeitura = useSomenteLeitura();
  const [lembretes, setLembretes] = useState<LembreteFatura[]>([]);
  const [indice, setIndice] = useState(0);
  const [adiado, setAdiado] = useState(true);

  // Na tela de Cartões o botão "Importar fatura" já está à vista (e o modal abre por cima).
  const naTelaDeCartoes = pathname === "/financeiro/cartoes" || pathname === "/pessoal/cartoes";

  // Confere de novo a cada troca de tela: depois de importar, o balão some.
  useEffect(() => {
    if (somenteLeitura || naTelaDeCartoes) return;
    if (adiadoHoje()) {
      setAdiado(true);
      return;
    }
    setAdiado(false);
    let vivo = true;
    carregarLembretesFatura(createClient() as any, hojeLocal())
      .then((l) => {
        if (!vivo) return;
        setLembretes(l);
        setIndice(0);
      })
      .catch(() => {
        if (vivo) setLembretes([]);
      });
    return () => {
      vivo = false;
    };
  }, [pathname, somenteLeitura, naTelaDeCartoes]);

  if (somenteLeitura || naTelaDeCartoes || adiado || lembretes.length === 0) return null;
  const l = lembretes[Math.min(indice, lembretes.length - 1)];

  function depois() {
    try {
      localStorage.setItem(CHAVE_ADIADO, hojeLocal());
    } catch {
      // sem armazenamento: esconde só nesta tela
    }
    setAdiado(true);
  }

  return (
    <div
      role="status"
      className="cartao fixed bottom-20 left-4 right-20 z-20 p-4 md:bottom-24 md:left-auto md:right-6 md:w-80"
    >
      <div className="flex items-start gap-3">
        <IconeChip icone={FileUp} cor="roxo" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-neutral-900">Importar a fatura do cartão</p>
          <p className="mt-0.5 text-xs text-neutral-600">
            Fatura do {l.nome} fechou em {diaMes(l.fechamento)}. Importe o arquivo OFX.
          </p>
          {lembretes.length > 1 && (
            <button
              type="button"
              onClick={() => setIndice((i) => (i + 1) % lembretes.length)}
              className="mt-1 text-[11px] font-medium text-neutral-500 underline"
            >
              {Math.min(indice, lembretes.length - 1) + 1} de {lembretes.length} cartões · ver o próximo
            </button>
          )}
        </div>
        <button type="button" onClick={depois} aria-label="Lembrar depois" className="-mr-1 -mt-1 p-1 text-neutral-400">
          <X size={16} />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href={linkImportarFatura(l)}
          className="flex-1 rounded-xl bg-brand-gradient px-3 py-2 text-center text-sm font-semibold text-white"
        >
          Importar agora
        </Link>
        <button
          type="button"
          onClick={depois}
          className="rounded-xl border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600"
        >
          Depois
        </button>
      </div>
    </div>
  );
}
