"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NovoClienteModal from "./NovoClienteModal";
import { createClient } from "@/lib/supabase/client";
import type { Periodo } from "@/lib/period";
import FiltroBarra from "@/components/FiltroBarra";
import { exportarCsv } from "@/lib/exportar-csv";
import { formatCurrency, formatDate, buildMapsLink, buildWazeLink, buildWhatsAppLink } from "@/lib/format";

const ETAPAS: Record<string, string> = {
  lead: "Lead",
  contato: "Contato",
  nutricao: "Nutrição",
  qualificado: "Qualificado",
  agendado: "Agendamento",
};

interface ClientRow {
  id: string;
  name: string;
  clinic_name: string | null;
  whatsapp: string | null;
  city: string | null;
  address: string | null;
  taxasPendentes: number;
  taxasPagas: number;
  valorPendente: number;
  data_evento: string | null;
  // Onde a pessoa está no funil AGORA. Não decide mais se ela aparece
  // nesta lista, só aparece como aviso quando ela está em negociação.
  stage?: string;
  stats: { count: number; total: number; lastDate: string | null };
  nextEvent: { date_start: string; confirmed: boolean } | null;
}

export default function ClientesClient({
  initialClients,
  cidades,
  periodo,
}: {
  initialClients: ClientRow[];
  cidades: string[];
  periodo: Periodo;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [modalOpen, setModalOpen] = useState(false);

  // A peneira toda mora na consulta do servidor agora.
  const filtered = initialClients;

  function baixarCsv() {
    exportarCsv(
      filtered,
      [
        { titulo: "Cliente", valor: (c) => c.name },
        { titulo: "Clínica", valor: (c) => c.clinic_name ?? "" },
        { titulo: "Cidade", valor: (c) => c.city ?? "" },
        { titulo: "WhatsApp", valor: (c) => c.whatsapp ?? "" },
        { titulo: "Locações no período", valor: (c) => c.stats.count },
        { titulo: "Total no período", valor: (c) => c.stats.total },
        { titulo: "Última reserva", valor: (c) => (c.stats.lastDate ? formatDate(c.stats.lastDate) : "") },
        { titulo: "Taxas pendentes", valor: (c) => c.taxasPendentes },
        { titulo: "Em aberto", valor: (c) => c.valorPendente },
        { titulo: "Etapa no funil", valor: (c) => c.stage ?? "" },
      ],
      "clientes",
      periodo.rotulo
    );
  }

  function handleCreated() {
    setModalOpen(false);
    router.refresh();
  }

  async function toggleConfirmed(clientId: string, currentEvent: { date_start: string; confirmed: boolean }) {
    await supabase
      .from("calendar_events")
      .update({ confirmed: !currentEvent.confirmed })
      .eq("client_id", clientId)
      .eq("date_start", currentEvent.date_start);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">Clientes</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="rounded-xl bg-brand-gradient px-4 py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98]"
        >
          + Novo cliente
        </button>
      </div>

      <FiltroBarra
        periodoPadrao="ano"
        rotuloPeriodo={periodo.rotulo}
        contagem={{
          mostrando: filtered.length,
          rotulo: filtered.length === 1 ? "cliente" : "clientes",
        }}
        campos={[
          {
            chave: "situacao",
            rotuloVazio: "Todos os clientes",
            opcoes: [
              { valor: "no_periodo", label: "Alugaram no período" },
              { valor: "taxa_pendente", label: "Com taxa pendente" },
              { valor: "com_agendamento", label: "Com agendamento futuro" },
              { valor: "sem_locacao", label: "Nunca alugaram" },
            ],
          },
          {
            chave: "cidade",
            rotuloVazio: "Todas as cidades",
            opcoes: cidades.map((c) => ({ valor: c, label: c })),
          },
        ]}
        buscaPlaceholder="Buscar por nome, clínica ou cidade..."
        acoes={
          <button
            type="button"
            onClick={baixarCsv}
            disabled={filtered.length === 0}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300"
          >
            Exportar CSV
          </button>
        }
      />

      {/* O período mede, não esconde: a lista traz todo mundo, e as
          colunas de Locações e Total contam só o recorte escolhido. Sem
          esta linha, um cliente antigo aparecendo com zero locações
          pareceria erro de cadastro. */}
      <p className="-mt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
        Locações e Total contam {periodo.rotulo}. A lista mostra todos os clientes, inclusive quem
        não alugou nesse recorte.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((c) => (
          <div
            key={c.id}
            className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur-xl transition hover:border-brand-teal hover:shadow-glow-brand dark:border-neutral-800/60 dark:bg-neutral-900/55"
          >
            <Link href={`/clientes/${c.id}`}>
              <p className="font-medium text-neutral-900 dark:text-neutral-100">{c.name}</p>
              {c.clinic_name && <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">{c.clinic_name}</p>}
              <p className="mt-0.5 text-xs text-neutral-400">{c.city ?? "-"}</p>

              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-neutral-50 p-2.5 text-xs dark:bg-neutral-800/60">
                <div>
                  <p className="text-neutral-400">Locações</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">{c.stats.count}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Total</p>
                  <p className="font-medium text-brand-teal">{formatCurrency(c.stats.total)}</p>
                </div>
                <div>
                  <p className="text-neutral-400">Indicações</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">—</p>
                </div>
                <div>
                  <p className="text-neutral-400">Última reserva</p>
                  <p className="font-medium text-neutral-700 dark:text-neutral-200">
                    {c.stats.lastDate ? formatDate(c.stats.lastDate) : "-"}
                  </p>
                </div>
              </div>
            </Link>

            {/* Cliente que voltou para o funil continua na lista, porque
                quem alugou uma vez é cliente para sempre. A etiqueta diz
                onde ele está agora, para a presença dele aqui não parecer
                incoerente com o quadro do funil. */}
            {c.stage && c.stage !== "cliente" && (
              <p className="mt-2 w-fit rounded-full bg-brand-blue/10 px-2 py-1 text-[11px] font-medium text-brand-blue">
                Em negociação · {ETAPAS[c.stage] ?? c.stage}
              </p>
            )}

            {(c.nextEvent || c.taxasPendentes > 0 || c.taxasPagas > 0) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {c.nextEvent && (
                  <button
                    onClick={() => toggleConfirmed(c.id, c.nextEvent!)}
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${
                      c.nextEvent.confirmed
                        ? "bg-brand-teal/10 text-brand-teal"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    }`}
                  >
                    📅 {formatDate(c.nextEvent.date_start)} · {c.nextEvent.confirmed ? "Confirmado" : "Não confirmado"}
                  </button>
                )}
                {/* Etiqueta, não botão: com várias datas reservadas,
                    "marcar paga" daqui não diria qual delas. Os botões por
                    agendamento ficam na ficha do cliente. */}
                {c.taxasPendentes > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    💳 {c.taxasPendentes === 1 ? "Taxa pendente" : `${c.taxasPendentes} taxas pendentes`}
                    {c.valorPendente > 0 ? ` · ${formatCurrency(c.valorPendente)}` : ""}
                  </span>
                )}
                {c.taxasPendentes === 0 && c.taxasPagas > 0 && (
                  <span className="rounded-full bg-brand-teal/10 px-2 py-1 text-[11px] font-medium text-brand-teal">
                    💳 {c.taxasPagas === 1 ? "Taxa paga" : `${c.taxasPagas} taxas pagas`}
                  </span>
                )}
              </div>
            )}

            {(c.whatsapp || c.address) && (
              <div className="mt-2 flex gap-2">
                {buildWhatsAppLink(c.whatsapp) && (
                  <a
                    href={buildWhatsAppLink(c.whatsapp)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs text-brand-teal underline underline-offset-2"
                  >
                    WhatsApp
                  </a>
                )}
                {buildMapsLink(c.address) && (
                  <a
                    href={buildMapsLink(c.address)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs text-brand-blue underline underline-offset-2"
                  >
                    Maps
                  </a>
                )}
                {buildWazeLink(c.address) && (
                  <a
                    href={buildWazeLink(c.address)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 text-center text-xs text-brand-lilac underline underline-offset-2"
                  >
                    Waze
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-neutral-300/70 bg-white/50 py-12 text-center text-neutral-400 backdrop-blur-xl dark:border-neutral-700/60 dark:bg-neutral-900/40">
            Nenhum cliente encontrado.
          </div>
        )}
      </div>

      {modalOpen && <NovoClienteModal onClose={() => setModalOpen(false)} onCreated={handleCreated} />}
    </div>
  );
}
