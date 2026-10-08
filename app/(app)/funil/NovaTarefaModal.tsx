"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import ClientPicker from "@/components/ClientPicker";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { hojeLocal } from "@/lib/period";
import { escutar, podeReconhecerFala } from "@/lib/reconhecer-fala";
import { interpretarFala, type ClienteParaVoz } from "@/lib/voz";
// Tipo mínimo de propósito — este modal é usado em vários lugares (Funil,
// ficha do cliente, botão "+" global em qualquer tela), então não depende
// do tipo completo de nenhuma tela específica, só do que realmente precisa
// pra montar a lista.
interface ClientOption {
  id: string;
  name: string;
}

// Modal único, usado em três lugares: solto no painel de tarefas do Funil e
// no botão "+" global (aí "leads" vem preenchido e a pessoa escolhe o
// cliente numa lista, ou deixa "Nenhum" pra criar uma tarefa solta) e
// dentro da ficha de um lead (aí vem "lockedClientId"/"lockedClientName" e
// o cliente já fica fixo, sem lista pra escolher).
// Com "porVoz" (atalho "Anotar por voz"), já abre escutando: a frase dita
// preenche o que fazer, a data e o cliente, e a pessoa confere e salva.
export default function NovaTarefaModal({
  leads = [],
  lockedClientId,
  lockedClientName,
  porVoz = false,
  onClose,
  onCreated,
}: {
  leads?: ClientOption[];
  porVoz?: boolean;
  lockedClientId?: string;
  lockedClientName?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [title, setTitle] = useState("");
  const [clientId, setClientId] = useState(lockedClientId ?? "");
  const [dueDate, setDueDate] = useState(() => hojeLocal());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [temMicrofone, setTemMicrofone] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [candidatos, setCandidatos] = useState<ClienteParaVoz[]>([]);
  const [entendido, setEntendido] = useState<string | null>(null);
  const pararRef = useRef<(() => void) | null>(null);
  // A lista de clientes pode chegar depois de abrir; a fala usa a mais nova.
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  function comecarAEscutar(automatico = false) {
    setError(null);
    setParcial("");
    setEntendido(null);
    setOuvindo(true);
    pararRef.current = escutar(setParcial, (final, erro) => {
      setOuvindo(false);
      pararRef.current = null;
      if (!final) {
        // Abrindo pelo atalho do ícone, o Android às vezes só libera o
        // microfone depois de um toque na tela.
        if (erro) setError(automatico ? "Toque no microfone para falar." : erro);
        return;
      }
      const r = interpretarFala(final, lockedClientId ? [] : leadsRef.current, hojeLocal());
      setTitle(r.titulo);
      setDueDate(r.data);
      if (!lockedClientId) {
        setClientId(r.clienteId ?? "");
        setCandidatos(r.candidatos);
      }
      setEntendido(final);
    });
  }

  useEffect(() => {
    const pode = podeReconhecerFala();
    setTemMicrofone(pode);
    if (pode && porVoz) comecarAEscutar(true);
    if (!pode && porVoz) setError("Este navegador não entende fala. Escreva a tarefa abaixo.");
    return () => pararRef.current?.();
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedLeads = [...leads].sort((a, b) => a.name.localeCompare(b.name));

  async function handleSave() {
    if (!title.trim()) {
      setError("Escreva o que precisa ser feito.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("tasks").insert({
      client_id: clientId || null,
      type: "manual",
      title: title.trim(),
      due_date: dueDate,
    });
    setSaving(false);
    if (insertError) {
      setError("Não foi possível criar a tarefa. Tente novamente.");
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Nova tarefa</h2>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              O que precisa ser feito
            </label>
            <div className="flex items-center gap-2">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Ligar pra confirmar o endereço"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              {temMicrofone && (
                <button
                  type="button"
                  onClick={() => (ouvindo ? pararRef.current?.() : comecarAEscutar())}
                  aria-label={ouvindo ? "Parar de ouvir" : "Falar a tarefa"}
                  className={`shrink-0 rounded-full p-2.5 ${
                    ouvindo ? "animate-pulse bg-red-600 text-white" : "bg-brand-teal text-white"
                  }`}
                >
                  <Mic size={16} />
                </button>
              )}
            </div>
            {ouvindo && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Ouvindo... {parcial || "fale, por exemplo: cobrar a Ylka amanhã"}
              </p>
            )}
            {entendido && !ouvindo && (
              <p className="mt-1 text-[11px] text-neutral-400">
                Ouvi: &ldquo;{entendido}&rdquo;. Confira a data ({formatDate(dueDate)}) e o cliente antes de salvar.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Cliente (opcional)
            </label>
            {lockedClientId ? (
              <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {lockedClientName}
              </p>
            ) : (
              <ClientPicker
                clients={sortedLeads}
                value={clientId}
                onChange={setClientId}
                onClientCreated={() => {}}
                label=""
                optional
                noneLabel="Nenhum (tarefa solta)"
                allowCreate={false}
              />
            )}
            {!lockedClientId && candidatos.length > 0 && !clientId && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="w-full text-[11px] text-neutral-400">Qual destes?</span>
                {candidatos.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClientId(c.id);
                      setCandidatos([]);
                    }}
                    className="rounded-full border border-brand-teal px-2.5 py-1 text-xs text-brand-teal"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
