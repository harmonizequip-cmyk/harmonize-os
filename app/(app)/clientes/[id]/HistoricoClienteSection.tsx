"use client";

// Histórico de movimentações do cliente, embutido na própria ficha (o
// usuário pediu explicitamente que fosse aqui, não só na tela geral de
// /movimentacoes). Junta tudo que já é registrado por registrar_movimentacao
// em qualquer lugar do sistema (agendamento, reagendamento, cancelamento,
// edição, pagamento, exclusão...) e filtra só o que pertence a este
// cliente: o registro do cliente em si, mais tudo que aconteceu nas
// locações, na agenda e nos lançamentos financeiros dele.
//
// Carrega só quando a seção é aberta (não em toda visita à ficha), porque
// é uma consulta a mais que a maioria das visitas não precisa.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ACAO_META, ENTIDADE_LABEL, formatarDataHora, descreverDetalhes, type Movimentacao } from "@/lib/movimentacoes";

export default function HistoricoClienteSection({ clientId }: { clientId: string }) {
  const supabase = createClient();
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const [rows, setRows] = useState<Movimentacao[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const [rentalsRes, eventsRes, transactionsRes] = await Promise.all([
        supabase.from("rentals").select("id").eq("client_id", clientId),
        supabase.from("calendar_events").select("id").eq("client_id", clientId),
        supabase.from("transactions").select("id").eq("client_id", clientId),
      ]);

      const rentalIds = (rentalsRes.data ?? []).map((r) => r.id);
      const eventIds = (eventsRes.data ?? []).map((r) => r.id);
      const transactionIds = (transactionsRes.data ?? []).map((r) => r.id);

      // .or() do PostgREST: cada condição é "entidade.eq.X,entidade_id.in.(...)"
      // amarrada com and(...). Uma lista vazia quebraria in.(), então essas
      // entidades só entram no filtro quando têm pelo menos um id.
      const condicoes = [`and(entidade.eq.clients,entidade_id.eq.${clientId})`];
      if (rentalIds.length > 0) condicoes.push(`and(entidade.eq.rentals,entidade_id.in.(${rentalIds.join(",")}))`);
      if (eventIds.length > 0) condicoes.push(`and(entidade.eq.calendar_events,entidade_id.in.(${eventIds.join(",")}))`);
      if (transactionIds.length > 0) condicoes.push(`and(entidade.eq.transactions,entidade_id.in.(${transactionIds.join(",")}))`);

      const { data, error } = await supabase
        .from("movimentacoes")
        .select("id, ocorrido_em, usuario_nome, acao, entidade, entidade_id, descricao, detalhes")
        .or(condicoes.join(","))
        .order("ocorrido_em", { ascending: false })
        .limit(200);

      if (error) {
        setErro("Não foi possível carregar o histórico agora.");
      } else {
        setRows((data as Movimentacao[]) ?? []);
      }
    } finally {
      setCarregando(false);
      setCarregado(true);
    }
  }

  function handleToggle() {
    const next = !aberto;
    setAberto(next);
    if (next && !carregado && !carregando) carregar();
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-900/55">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          Histórico do cliente
        </span>
        <span className="text-xs text-neutral-400">{aberto ? "ocultar ▲" : "ver tudo que já aconteceu ▼"}</span>
      </button>

      {aberto && (
        <div className="border-t border-neutral-100 px-4 py-3 dark:border-neutral-800">
          {carregando && <p className="py-4 text-center text-sm text-neutral-400">Carregando histórico...</p>}
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

          {!carregando && !erro && rows.length === 0 && (
            <p className="py-2 text-sm text-neutral-400">Nenhuma movimentação registrada ainda para este cliente.</p>
          )}

          {!carregando && rows.length > 0 && (
            <ul className="space-y-2">
              {rows.map((m) => {
                const meta = ACAO_META[m.acao] ?? { label: m.acao, classe: "bg-neutral-100 text-neutral-600" };
                const detalhe = descreverDetalhes(m);
                return (
                  <li key={m.id} className="rounded-xl border border-neutral-100 p-2.5 text-sm dark:border-neutral-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.classe}`}>{meta.label}</span>
                      <span className="text-xs text-neutral-400">{ENTIDADE_LABEL[m.entidade] ?? m.entidade}</span>
                      <span className="ml-auto text-xs text-neutral-400">{formatarDataHora(m.ocorrido_em)}</span>
                    </div>
                    <p className="mt-1 text-neutral-700 dark:text-neutral-300">{m.descricao}</p>
                    {detalhe && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{detalhe}</p>}
                    <p className="mt-1 text-[11px] text-neutral-400">por {m.usuario_nome}</p>
                  </li>
                );
              })}
            </ul>
          )}

          {!carregando && rows.length >= 200 && (
            <p className="mt-2 text-center text-[11px] text-neutral-400">
              Mostrando as 200 mais recentes. Para ver mais, use a tela de{" "}
              <a href="/movimentacoes" className="underline underline-offset-2">
                Movimentações
              </a>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
