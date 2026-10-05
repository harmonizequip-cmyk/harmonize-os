"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ConfirmarExclusaoModal from "@/components/ConfirmarExclusaoModal";
import { PIX_CONTAS } from "@/lib/rental-calculator";
import { formatCurrency } from "@/lib/format";
import { valorParaNumero, numeroParaCampo } from "@/lib/valor";
import LocacaoDoClienteSelect, { SEM_VINCULO, type VinculoDespesa } from "@/components/LocacaoDoClienteSelect";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

interface CategoryRow {
  id: string;
  name: string;
  type: "entrada" | "saida";
}

interface ClientOption {
  id: string;
  name: string;
}

interface TransactionToEdit {
  id: string;
  type: "entrada" | "saida";
  description: string;
  amount: number;
  payment_method: string;
  date: string;
  category_id: string | null;
  client_id: string | null;
  rental_id?: string | null;
  calendar_event_id?: string | null;
}

// Pagamento de locação (linha de rental_payments ligada a este lançamento).
interface PagamentoLocacao {
  id: string;
  rental_id: string;
  forma: string;
  valor: number;
  data: string;
  pix_conta: string | null;
}

export default function EditarLancamentoModal({
  transaction,
  categories,
  clients,
  onClose,
  onSaved,
  onDeleted,
}: {
  transaction: TransactionToEdit;
  categories: CategoryRow[];
  clients: ClientOption[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const supabase = createClient();
  const [type, setType] = useState<"entrada" | "saida">(transaction.type);
  const [description, setDescription] = useState(transaction.description);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [categoryId, setCategoryId] = useState(transaction.category_id ?? "");
  const [clientId, setClientId] = useState(transaction.client_id ?? "");
  // Despesa já amarrada a uma locação mostra a locação; a que ainda está
  // só na reserva mostra a reserva.
  const [vinculo, setVinculo] = useState<VinculoDespesa>({
    rentalId: transaction.rental_id ?? null,
    eventId: transaction.rental_id ? null : (transaction.calendar_event_id ?? null),
  });
  // Entrada que já nasceu presa a uma locação (o valor cobrado, um
  // pagamento) tem o vínculo controlado pela própria locação: aqui não se
  // mexe nele. Só despesa escolhe locação por este formulário.
  const vinculoFixo = transaction.type === "entrada" && !!transaction.rental_id;
  const podeEscolherLocacao = !vinculoFixo && type === "saida" && !!clientId;
  const [paymentMethod, setPaymentMethod] = useState(transaction.payment_method);
  const [date, setDate] = useState(transaction.date);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  // Entrada ligada a uma locação pode ser um pagamento dela. Nesse caso o
  // valor e a data mandam no saldo da locação, então a edição passa pelas
  // funções de pagamento (que mexem no caixa junto) e o "excluir" comum,
  // que apagaria a locação inteira, sai de cena: só dá para remover o
  // pagamento.
  const ehEntradaLocacao = transaction.type === "entrada" && !!transaction.rental_id;
  const [carregandoPag, setCarregandoPag] = useState(ehEntradaLocacao);
  const [pagLocacao, setPagLocacao] = useState<PagamentoLocacao | null>(null);
  const [pagMaximo, setPagMaximo] = useState<number | null>(null);
  const [pagValor, setPagValor] = useState("");
  const [pagData, setPagData] = useState("");
  const [pagForma, setPagForma] = useState("pix");
  const [pagConta, setPagConta] = useState("harmonize");

  useEffect(() => {
    if (!ehEntradaLocacao) return;
    let ativo = true;
    (async () => {
      const { data: pag, error: erroPag } = await supabase
        .from("rental_payments")
        .select("id, rental_id, forma, valor, data, pix_conta")
        .eq("transaction_id", transaction.id)
        .maybeSingle();
      if (!ativo) return;
      if (erroPag) {
        setError("Não consegui ler os dados do pagamento. Feche e abra de novo antes de editar.");
        setCarregandoPag(false);
        return;
      }
      if (pag) {
        const p = pag as PagamentoLocacao;
        setPagLocacao(p);
        setPagValor(numeroParaCampo(Number(p.valor)));
        setPagData(p.data);
        setPagForma(p.forma);
        setPagConta(p.pix_conta ?? "harmonize");
        const { data: sit } = await supabase
          .from("rentals_situacao_pagamento")
          .select("saldo")
          .eq("rental_id", p.rental_id)
          .maybeSingle();
        if (!ativo) return;
        if (sit) setPagMaximo(Number(p.valor) + Number(sit.saldo ?? 0));
      }
      setCarregandoPag(false);
    })();
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transaction.id]);

  async function salvarPagamento() {
    if (!pagLocacao) return;
    const valor = valorParaNumero(pagValor);
    if (!Number.isFinite(valor) || valor <= 0) {
      setError("Informe um valor válido.");
      return;
    }
    if (pagMaximo !== null && valor > pagMaximo + 0.001) {
      setError(`O valor passa do que a locação tem a receber (máximo ${formatCurrency(pagMaximo)}).`);
      return;
    }
    if (!pagData) {
      setError("Informe a data em que o dinheiro entrou.");
      return;
    }
    if (!window.confirm("Corrigir este pagamento? O caixa e o saldo da locação são atualizados juntos.")) return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("editar_pagamento_locacao", {
      p_payment_id: pagLocacao.id,
      p_forma: pagForma,
      p_valor: valor,
      p_data: pagData,
      p_pix_conta: pagForma === "pix" ? pagConta : null,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message || "Não foi possível corrigir o pagamento.");
      return;
    }
    onSaved();
  }

  async function removerPagamento() {
    if (!pagLocacao) return;
    if (
      !window.confirm(
        "Remover só este pagamento? O lançamento no caixa é apagado e o valor volta a ficar em aberto na locação. A locação em si não é apagada."
      )
    )
      return;
    setSaving(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc("remover_pagamento_locacao", { p_payment_id: pagLocacao.id });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message || "Não foi possível remover o pagamento.");
      return;
    }
    onDeleted();
  }

  // Locação e Mentoria (entrada) são geradas pelo sistema; só aparecem
  // aqui quando o lançamento já é de uma delas, para não sumir da tela.
  const categoriasDoTipo = categories.filter(
    (c) =>
      c.type === type &&
      (c.id === transaction.category_id ||
        !(type === "entrada" && ["locação", "mentoria"].includes(c.name.trim().toLowerCase())))
  );

  async function handleSave() {
    const amountNumber = valorParaNumero(amount);
    if (!description.trim() || !amountNumber || !date) {
      setError("Preencha descrição, valor e data.");
      return;
    }
    if (!window.confirm("Salvar essas alterações no lançamento?")) return;
    setSaving(true);
    setError(null);
    const { error } = await supabase
      .from("transactions")
      .update({
        type,
        description: description.trim(),
        amount: amountNumber,
        category_id: categoryId || null,
        client_id: clientId || null,
        ...(vinculoFixo
          ? {}
          : {
              rental_id: podeEscolherLocacao ? vinculo.rentalId : null,
              // Mantém a reserva de origem quando a locação não mudou, para
              // não apagar de onde a despesa veio.
              calendar_event_id: !podeEscolherLocacao
                ? null
                : vinculo.rentalId
                  ? vinculo.rentalId === transaction.rental_id
                    ? (transaction.calendar_event_id ?? null)
                    : null
                  : vinculo.eventId,
            }),
        payment_method: paymentMethod,
        date,
      })
      .eq("id", transaction.id);
    setSaving(false);
    if (error) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    onSaved();
  }

  const casca = (filhos: React.ReactNode) => (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {filhos}
      </div>
    </div>
  );

  if (ehEntradaLocacao && carregandoPag) {
    return casca(<p className="text-sm text-neutral-500 dark:text-neutral-400">Carregando pagamento...</p>);
  }

  if (pagLocacao) {
    const campo =
      "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";
    const rotulo = "mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400";
    return casca(
      <>
        <h2 className="mb-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Pagamento de locação</h2>
        <p className="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
          {transaction.description}. Valor e data ficam ligados ao saldo da locação, por isso a correção atualiza o
          caixa e o saldo juntos.
        </p>
        <div className="space-y-3">
          <div>
            <label className={rotulo}>Valor recebido</label>
            <input inputMode="decimal" value={pagValor} onChange={(e) => setPagValor(e.target.value)} className={campo} />
            {pagMaximo !== null && (
              <p className="mt-1 text-[11px] text-neutral-400">Máximo permitido: {formatCurrency(pagMaximo)}</p>
            )}
          </div>
          <div>
            <label className={rotulo}>Data em que entrou</label>
            <input type="date" value={pagData} onChange={(e) => setPagData(e.target.value)} className={campo} />
          </div>
          <div>
            <label className={rotulo}>Forma de pagamento</label>
            <select value={pagForma} onChange={(e) => setPagForma(e.target.value)} className={campo}>
              {PAYMENT_METHODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          {pagForma === "pix" && (
            <div>
              <label className={rotulo}>Conta PIX que recebeu</label>
              <select value={pagConta} onChange={(e) => setPagConta(e.target.value)} className={campo}>
                {PIX_CONTAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            onClick={salvarPagamento}
            disabled={saving}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {saving ? "Salvando..." : "Corrigir pagamento"}
          </button>
        </div>

        <button
          onClick={removerPagamento}
          disabled={saving}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 disabled:opacity-60 dark:border-red-900/50 dark:text-red-400"
        >
          Remover só este pagamento
        </button>
        {transaction.client_id && (
          <Link
            href={`/clientes/${transaction.client_id}`}
            className="mt-2 block text-center text-xs text-brand-teal underline underline-offset-2"
          >
            Abrir a ficha do cliente
          </Link>
        )}
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar lançamento</h2>

        <div className="mb-3 flex gap-2">
          {(["entrada", "saida"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
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
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Descrição</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor</label>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Categoria</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Sem categoria</option>
              {categoriasDoTipo.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Cliente (opcional — deslocamento, etc.)
            </label>
            <select
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                if (!vinculoFixo) setVinculo(SEM_VINCULO);
              }}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="">Nenhum</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {podeEscolherLocacao && (
            <LocacaoDoClienteSelect
              key={clientId}
              clientId={clientId}
              value={vinculo}
              onChange={setVinculo}
              dataReferencia={date}
              sugerir={clientId !== (transaction.client_id ?? "")}
            />
          )}
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

        {ehEntradaLocacao && (
          <p className="mt-3 rounded-lg bg-amber-100 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Atenção: este lançamento pertence a uma locação. Excluir aqui apaga a locação inteira, com os pagamentos
            e o agendamento.
          </p>
        )}
        <button
          onClick={() => setConfirmarExclusao(true)}
          className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/50 dark:text-red-400"
        >
          {ehEntradaLocacao ? "Excluir a locação inteira" : "Excluir lançamento"}
        </button>

        {/* A confirmação chama preview_exclusao antes de apagar e mostra o
            que sai junto. Lançamento que pertence a uma locação faz a
            exclusão subir para a locação inteira, e o aviso diz isso na
            tela antes de confirmar. */}
        {confirmarExclusao && (
          <ConfirmarExclusaoModal
            table="transactions"
            id={transaction.id}
            onCancel={() => setConfirmarExclusao(false)}
            onDeleted={() => {
              setConfirmarExclusao(false);
              onDeleted();
            }}
          />
        )}
      </div>
    </div>
  );
}
