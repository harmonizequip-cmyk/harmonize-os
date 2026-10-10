"use client";

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import ClientPicker from "@/components/ClientPicker";
import { createClient } from "@/lib/supabase/client";
import LocacaoDoClienteSelect, { SEM_VINCULO, type VinculoDespesa } from "@/components/LocacaoDoClienteSelect";

import { hojeLocal } from "@/lib/period";
import { valorParaNumero } from "@/lib/valor";
import { escutar, podeReconhecerFala } from "@/lib/reconhecer-fala";
import { interpretarDespesa, type ClienteParaVoz } from "@/lib/voz";
const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

// Categorias de entrada geradas pelo próprio sistema (ver comentário em
// filteredCategories).
const CATEGORIAS_AUTOMATICAS = ["locação", "mentoria"];

interface CategoryRow {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

interface ClientOption {
  id: string;
  name: string;
}

export default function NovoLancamentoModal({
  categories,
  clients,
  porVoz = false,
  onClose,
  onCreated,
}: {
  categories: CategoryRow[];
  clients: ClientOption[];
  porVoz?: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const supabase = createClient();
  const [type, setType] = useState<"entrada" | "saida">(porVoz ? "saida" : "entrada");
  const [categoryId, setCategoryId] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [clientId, setClientId] = useState("");
  // Locação ou reserva a que a despesa pertence. Só vale para saída com cliente.
  const [vinculo, setVinculo] = useState<VinculoDespesa>(SEM_VINCULO);
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [date, setDate] = useState(() => hojeLocal());
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Despesa por voz ("+" > Despesa por voz): a frase preenche categoria,
  // descrição, valor, forma, data e cliente; a pessoa confere e salva.
  const [temMicrofone, setTemMicrofone] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const [entendido, setEntendido] = useState<string | null>(null);
  const [candidatos, setCandidatos] = useState<ClienteParaVoz[]>([]);
  const pararRef = useRef<(() => void) | null>(null);
  const clientesRef = useRef(clients);
  clientesRef.current = clients;

  function falarDespesa(automatico = false) {
    setError(null);
    setParcial("");
    setEntendido(null);
    setOuvindo(true);
    pararRef.current = escutar(setParcial, (final, erro) => {
      setOuvindo(false);
      pararRef.current = null;
      if (!final) {
        if (erro) setError(automatico ? "Toque no microfone para falar." : erro);
        return;
      }
      const r = interpretarDespesa(final, {
        categorias: categories.filter((c) => c.type === "saida"),
        clientes: clientesRef.current,
        hoje: hojeLocal(),
      });
      setType("saida");
      setCategoryId(r.categoriaId ?? "");
      setDescription(r.descricao);
      if (r.valor) setAmount(r.valor);
      if (r.forma) setPaymentMethod(r.forma);
      setDate(r.data);
      setClientId(r.clienteId ?? "");
      setVinculo(SEM_VINCULO);
      setCandidatos(r.candidatos);
      setEntendido(final);
    });
  }

  useEffect(() => {
    const pode = podeReconhecerFala();
    setTemMicrofone(pode);
    if (pode && porVoz) falarDespesa(true);
    if (!pode && porVoz) setError("Este navegador não entende fala. Preencha abaixo.");
    return () => pararRef.current?.();
    // Só ao abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Receita de locação e de mentoria não se lança por aqui: ela nasce
  // sozinha quando a locação ou a mentoria é finalizada, com pagamento e
  // saldo amarrados. Lançar à mão criaria receita em dobro, fora do
  // controle de pagamento. Por isso as duas categorias ficam ocultas.
  const filteredCategories = categories.filter(
    (c) => c.type === type && !(type === "entrada" && CATEGORIAS_AUTOMATICAS.includes(c.name.trim().toLowerCase()))
  );

  async function handleSave() {
    const numericAmount = valorParaNumero(amount);
    if (!categoryId || !description || !amount || Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Preencha categoria, descrição e um valor válido.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error } = await supabase.from("transactions").insert({
      type,
      category_id: categoryId,
      description,
      amount: numericAmount,
      client_id: clientId || null,
      rental_id: type === "saida" && clientId ? vinculo.rentalId : null,
      calendar_event_id: type === "saida" && clientId ? vinculo.eventId : null,
      payment_method: paymentMethod,
      date,
      notes: notes || null,
      scope: "harmonize",
    });
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Novo lançamento</h2>

        {temMicrofone && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => (ouvindo ? pararRef.current?.() : falarDespesa())}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ${
                ouvindo ? "animate-pulse bg-red-600 text-white" : "border border-brand-teal text-brand-teal"
              }`}
            >
              <Mic size={16} />
              {ouvindo ? "Ouvindo... toque para parar" : "Falar a despesa"}
            </button>
            {ouvindo && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {parcial || "Ex: gasolina 150 reais no pix ontem"}
              </p>
            )}
            {entendido && !ouvindo && (
              <p className="mt-1 text-[11px] text-neutral-400">
                Ouvi: &ldquo;{entendido}&rdquo;. Confira categoria, valor e data antes de salvar.
              </p>
            )}
            {candidatos.length > 0 && !clientId && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="w-full text-[11px] text-neutral-400">É de qual cliente?</span>
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
        )}

        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["entrada", "saida"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setType(t);
                setCategoryId("");
              }}
              className={`rounded-xl py-2.5 text-sm font-medium transition ${
                type === t
                  ? t === "entrada"
                    ? "bg-brand-teal text-white"
                    : "bg-brand-pink text-white"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {t === "entrada" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Selecione</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor (R$)</label>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <ClientPicker
              clients={clients}
              value={clientId}
              onChange={(id) => {
                setClientId(id);
                setVinculo(SEM_VINCULO);
              }}
              onClientCreated={() => {}}
              label="Cliente (deslocamento, etc.)"
              optional
              allowCreate={false}
            />
          </div>

          {type === "saida" && clientId && (
            <LocacaoDoClienteSelect
              key={clientId}
              clientId={clientId}
              value={vinculo}
              onChange={setVinculo}
              dataReferencia={date}
              sugerir
            />
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Forma de pagamento</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
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
