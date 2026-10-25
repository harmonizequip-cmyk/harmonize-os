"use client";

// Cartão "Anotações" da ficha da cliente: as 3 últimas, com data e hora, e o
// botão que abre o painel completo (falar, digitar, histórico).

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Megaphone, Mic, StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { origemDaAnotacao } from "@/lib/anotacoes";
import AnotacoesCliente from "@/components/AnotacoesCliente";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

interface Linha {
  id: string;
  texto: string;
  origem: string | null;
  created_at: string;
}

export default function AnotacoesFicha({ clienteId, nome }: { clienteId: string; nome: string }) {
  const somenteLeitura = useSomenteLeitura();
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [total, setTotal] = useState(0);
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error, count } = await createClient()
      .from("cliente_anotacoes")
      .select("id, texto, origem, created_at", { count: "exact" })
      .eq("client_id", clienteId)
      .order("created_at", { ascending: false })
      .limit(3);
    setErro(!!error);
    setLinhas((data ?? []) as Linha[]);
    setTotal(count ?? 0);
  }, [clienteId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="cartao p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <StickyNote size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-neutral-900">Anotações</p>
          <p className="text-xs text-neutral-500">
            {total === 0 ? "Nada anotado ainda" : `${total} ${total === 1 ? "anotação" : "anotações"}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-teal-50 px-3 text-xs font-bold text-teal-700"
        >
          {!somenteLeitura && <Mic size={14} />}
          {somenteLeitura ? "Ver todas" : "Anotar"}
        </button>
      </div>
      {erro && <p className="mt-3 text-xs text-rose-600">Não consegui carregar as anotações.</p>}
      {linhas && linhas.length > 0 && (
        <ul className="mt-3 space-y-2">
          {linhas.map((l) => (
            <li key={l.id} className="rounded-xl bg-neutral-50 px-3 py-2">
              <p className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
                {format(new Date(l.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                {origemDaAnotacao(l.origem) === "campanha" && (
                  <span className="inline-flex items-center gap-1 font-normal text-neutral-400">
                    · <Megaphone size={11} className="flex-shrink-0" /> Campanha
                  </span>
                )}
              </p>
              <p className="line-clamp-2 text-sm text-neutral-800">{l.texto}</p>
            </li>
          ))}
          {total > 3 && (
            <li>
              <button type="button" onClick={() => setAberto(true)} className="text-xs font-semibold text-brand-teal-dark">
                Ver as {total} anotações
              </button>
            </li>
          )}
        </ul>
      )}
      {aberto && (
        <AnotacoesCliente
          clienteId={clienteId}
          nome={nome}
          onClose={() => {
            setAberto(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}
