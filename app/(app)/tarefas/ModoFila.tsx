"use client";

// "Atacar a fila": mostra uma tarefa de cada vez (as de hoje e as
// atrasadas), com a mensagem do WhatsApp pronta. Manda, marca o resultado e
// a próxima aparece sozinha. As ações são as mesmas da lista de Tarefas
// (vêm por props), só que em sequência.

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { buildWhatsAppLink, formatDate } from "@/lib/format";
import { mensagemDaTarefa } from "@/lib/tarefa-mensagem";
import { somarDias, hojeLocal } from "@/lib/period";
import TaxaRecebidaBotao from "@/components/TaxaRecebidaBotao";
import type { TarefaRow } from "./TarefasClient";

const TIPOS: Record<TarefaRow["type"], string> = {
  contato_inicial: "Primeiro contato",
  followup: "Follow-up",
  manual: "Tarefa",
  recontato: "Chamar de volta",
  confirmacao: "Confirmar reserva",
  pos_locacao: "Pós-locação",
  cobranca_taxa: "Cobrar taxa",
};

export default function ModoFila({
  tarefas,
  valorTaxa,
  onFeito,
  onRespondeu,
  onAdiar,
  onFechar,
}: {
  tarefas: TarefaRow[];
  valorTaxa?: number;
  onFeito: (id: string) => Promise<void>;
  onRespondeu: (id: string, respondeu: boolean) => Promise<void>;
  onAdiar: (id: string, data: string) => Promise<void>;
  onFechar: () => void;
}) {
  // Fotografia da fila ao abrir: concluir uma tarefa não reordena o resto.
  const fila = useMemo(() => tarefas, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [pos, setPos] = useState(0);
  const [feitas, setFeitas] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [mandou, setMandou] = useState(false);

  const t = fila[pos];

  async function seguir(acao?: () => Promise<void>, contaFeita = true) {
    if (acao) {
      setOcupado(true);
      await acao();
      setOcupado(false);
      if (contaFeita) setFeitas((n) => n + 1);
    }
    setMandou(false);
    setPos((p) => p + 1);
  }

  const casca = (conteudo: React.ReactNode) => (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900 sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {t ? `Tarefa ${pos + 1} de ${fila.length}` : "Fila"} · {feitas} {feitas === 1 ? "feita" : "feitas"}
          </p>
          <button onClick={onFechar} aria-label="Fechar" className="text-neutral-400">
            <X size={20} />
          </button>
        </div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className="h-full rounded-full bg-brand-teal transition-all"
            style={{ width: `${fila.length ? (Math.min(pos, fila.length) / fila.length) * 100 : 100}%` }}
          />
        </div>
        {conteudo}
      </div>
    </div>
  );

  if (!t) {
    return casca(
      <div className="py-6 text-center">
        <p className="text-3xl">🎉</p>
        <p className="mt-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">Fila zerada.</p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {feitas} {feitas === 1 ? "tarefa feita" : "tarefas feitas"} agora.
        </p>
        <button onClick={onFechar} className="mt-4 rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-medium text-white">
          Fechar
        </button>
      </div>
    );
  }

  const mensagem = mensagemDaTarefa({
    tipo: t.type,
    name: t.client_name,
    treatment: t.client_treatment,
    displayName: t.client_display_name,
    dataEvento: t.event_date,
    valorTaxa,
  });
  const link = mensagem ? buildWhatsAppLink(t.client_whatsapp ?? null, mensagem) : null;
  const taxaPendente = t.type === "cobranca_taxa" && t.event_id && t.event_taxa_status === "pendente";
  const ehContatoDeFunil = t.type === "contato_inicial" || t.type === "followup";
  const atrasada = t.due_date < hojeLocal();
  const botao = "flex-1 rounded-xl py-2.5 text-sm font-medium disabled:opacity-50";

  return casca(
    <>
      <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-medium text-brand-blue">{TIPOS[t.type]}</span>
      <p className="mt-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">{t.client_name ?? t.title}</p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {t.title} · {formatDate(t.due_date)}
        {atrasada && <span className="ml-1 font-medium text-red-600 dark:text-red-400">atrasada</span>}
      </p>

      {mensagem && (
        <p className="mt-3 whitespace-pre-line rounded-xl bg-neutral-50 p-3 text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {mensagem}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setMandou(true)}
            className="block rounded-xl bg-brand-teal py-3 text-center text-sm font-semibold text-white"
          >
            💬 Abrir no WhatsApp
          </a>
        ) : (
          mensagem && <p className="text-xs text-amber-700 dark:text-amber-400">Sem WhatsApp no cadastro.</p>
        )}
        {taxaPendente && (
          <TaxaRecebidaBotao eventId={t.event_id as string} valor={valorTaxa} onDone={() => seguir(async () => onFeito(t.id))} />
        )}
      </div>

      <p className="mb-2 mt-4 text-[11px] text-neutral-400">
        {mandou ? "Mandou? Marque como ficou:" : "Depois de mandar, marque como ficou:"}
      </p>
      <div className="flex gap-2">
        {ehContatoDeFunil ? (
          <>
            <button
              disabled={ocupado}
              onClick={() => seguir(() => onRespondeu(t.id, true))}
              className={`${botao} bg-brand-teal/10 text-brand-teal`}
            >
              ✅ Respondeu
            </button>
            <button
              disabled={ocupado}
              onClick={() => seguir(() => onRespondeu(t.id, false))}
              className={`${botao} bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400`}
            >
              🔁 Sem resposta
            </button>
          </>
        ) : (
          <button
            disabled={ocupado}
            onClick={() => seguir(() => onFeito(t.id))}
            className={`${botao} bg-brand-teal/10 text-brand-teal`}
          >
            ✅ Feito, próxima
          </button>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={ocupado}
          onClick={() => seguir(() => onAdiar(t.id, somarDias(hojeLocal(), 3)), false)}
          className={`${botao} border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300`}
        >
          📅 Daqui a 3 dias
        </button>
        <button
          disabled={ocupado}
          onClick={() => seguir()}
          className={`${botao} border border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300`}
        >
          Pular
        </button>
      </div>
    </>
  );
}
