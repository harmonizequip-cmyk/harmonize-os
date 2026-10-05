"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { calculateRentalValue, type PricingConfig } from "@/lib/rental-pricing";
import { formatCurrency } from "@/lib/format";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { valorParaNumero } from "@/lib/valor";

const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
];

// Leva S: "cancelada" saiu daqui de propósito — cancelar agora é uma
// ação dedicada (botão "Cancelar locação" mais abaixo), não mais um
// valor deste dropdown, para sempre passar pelas regras de negócio do
// cancelamento (taxa perdida, bloqueio se já paga, motivo/no-show).
const STATUS_OPTIONS = [
  { value: "pre_reserva", label: "Pré-reserva" },
  { value: "confirmada", label: "Confirmada" },
  { value: "realizada", label: "Realizada" },
];

interface EquipmentOption {
  id: string;
  code: string;
  name: string;
}

interface RentalToEdit {
  id: string;
  equipment_id: string;
  event_date: string;
  // Leva W: data final quando a locação cobre mais de um dia. Nulo/
  // ausente = locação de um dia só (o caso comum).
  event_date_end?: string | null;
  shots: number;
  calculated_value: number;
  payment_method: string;
  status: string;
  notes: string | null;
  // Leva O: deslocamento (ajuda de custo) — já dava para lançar na
  // criação da locação (calculadora), mas faltava dar para editar depois
  // que a locação já existe. Nulo/ausente = nenhum deslocamento lançado.
  km_ida?: number | null;
  valor_deslocamento?: number;
  // Leva AC: true = deslocamento já somado em calculated_value (calculadora);
  // não gera lançamento próprio no financeiro.
  deslocamento_incluso_no_valor?: boolean;
}

interface RentalPayment {
  id: string;
  forma: string;
  valor: number;
  data: string;
  pix_conta: string | null;
}

export default function EditarLocacaoModal({
  rental,
  equipments,
  pricingConfig,
  currentClientId,
  currentClientName,
  onClose,
  onSaved,
  onPaymentsChanged,
}: {
  rental: RentalToEdit;
  equipments: EquipmentOption[];
  pricingConfig?: PricingConfig;
  // Leva P.2: cliente atual desta locação (a página de onde o modal é
  // aberto é sempre a ficha de UM cliente, então não vem em `rental`).
  // Junto com a lista buscada abaixo, dá pra trocar o cliente quando a
  // locação foi lançada na pessoa errada.
  currentClientId: string;
  currentClientName: string;
  onClose: () => void;
  onSaved: () => void;
  // Lançar ou remover um pagamento não fecha o modal: quem abre só
  // precisa atualizar os dados por trás (saldo, situação), para dar para
  // lançar vários pagamentos em sequência (parte em PIX, parte em
  // dinheiro) e para não perder o que estiver sendo editado nos outros
  // campos.
  onPaymentsChanged?: () => void;
}) {
  const supabase = createClient();
  const [equipmentId, setEquipmentId] = useState(rental.equipment_id);
  const [eventDate, setEventDate] = useState(rental.event_date);
  // Leva W: período de vários dias. Nasce marcado se a locação já era um
  // período (edição de uma locação existente); senão nasce fechado, já
  // que é a exceção.
  const [isPeriodo, setIsPeriodo] = useState(!!rental.event_date_end);
  const [eventDateEnd, setEventDateEnd] = useState(rental.event_date_end ?? "");
  const [shots, setShots] = useState(String(rental.shots));
  const [valor, setValor] = useState(String(rental.calculated_value));
  const [status, setStatus] = useState(rental.status);
  const [notes, setNotes] = useState(rental.notes ?? "");
  // Leva O/Y/Z: deslocamento (ajuda de custo) — valor digitado direto (é o
  // que o cliente de fato pagou, quase nunca dá pra saber o km exato de
  // cabeça), com o km como campo separado, só para registro/histórico,
  // sem calcular nada a partir dele.
  const [valorDeslocamento, setValorDeslocamento] = useState(
    rental.valor_deslocamento ? String(rental.valor_deslocamento).replace(".", ",") : ""
  );
  const [kmIda, setKmIda] = useState(rental.km_ida ? String(rental.km_ida) : "");
  const [inclusoNoValor, setInclusoNoValor] = useState(!!rental.deslocamento_incluso_no_valor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kmIdaNumber = Number(kmIda.replace(/\D/g, "")) || 0;
  const valorDeslocamentoNumber = valorParaNumero(valorDeslocamento) || 0;

  // Leva S: cancelar deixou de ser uma opção do dropdown de status —
  // passa por uma RPC dedicada (cancelar_locacao), que aplica as mesmas
  // regras de cancelar_agendamento (bloqueia se já foi paga, taxa paga
  // vira perdida, motivo e não-comparecimento ficam registrados).
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelMotivo, setCancelMotivo] = useState("");
  const [cancelNoShow, setCancelNoShow] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancelarLocacao() {
    setCancelling(true);
    setCancelError(null);
    const { error: rpcError } = await supabase.rpc("cancelar_locacao", {
      p_rental_id: rental.id,
      p_motivo: cancelMotivo || null,
      p_no_show: cancelNoShow,
    });
    setCancelling(false);
    if (rpcError) {
      setCancelError(rpcError.message || "Não foi possível cancelar. Tente novamente.");
      return;
    }
    onSaved();
  }

  // ------------------------------------------------------------
  // Cliente (leva P.2): corrige quando a locação foi lançada na pessoa
  // errada. Busca a lista de clientes só quando o modal abre (a página
  // de origem não carrega essa lista, já que normalmente é fixa em um
  // cliente só).
  // ------------------------------------------------------------
  const [clientId, setClientId] = useState(currentClientId);
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([{ id: currentClientId, name: currentClientName }]);
  useEffect(() => {
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => {
        if (data && data.length > 0) setClientOptions(data);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------------------------------------------------------------
  // Pagamentos (leva O): registra/remove pagamentos parciais desta
  // locação, via RPCs que já criam/apagam a transação no caixa junto.
  // rentals.pago/pago_em são recalculados automaticamente pelo banco a
  // cada mudança — nunca setados diretamente por aqui.
  // ------------------------------------------------------------
  const [payments, setPayments] = useState<RentalPayment[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [saldoDevedor, setSaldoDevedor] = useState<number | null>(null);
  const [totalDespesas, setTotalDespesas] = useState(0);
  const [creditoTaxa, setCreditoTaxa] = useState(0);

  const [novoValor, setNovoValor] = useState("");
  const [novaForma, setNovaForma] = useState("pix");
  const [novaPixConta, setNovaPixConta] = useState("harmonize");
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Leva AC: lucro = o que de fato entrou (pagamentos + ajuda de custo lançada
  // à parte) menos os custos ligados à locação. Ajuda de custo que já está
  // somada no valor da locação não entra de novo: os pagamentos já a cobrem.
  const totalRecebido = payments.reduce((acc, p) => acc + Number(p.valor ?? 0), 0) + creditoTaxa;
  const ajudaCustoLancada = rental.deslocamento_incluso_no_valor ? 0 : Number(rental.valor_deslocamento ?? 0);
  const lucroLiquido = totalRecebido + ajudaCustoLancada - totalDespesas;

  // Leva AD: custo (gasolina etc.) ligado a esta locação, lançado aqui mesmo.
  const [categoriasSaida, setCategoriasSaida] = useState<{ id: string; name: string }[]>([]);
  const [custoCategoriaId, setCustoCategoriaId] = useState("");
  const [custoValor, setCustoValor] = useState("");
  const [custoForma, setCustoForma] = useState("dinheiro");
  const [custoDescricao, setCustoDescricao] = useState("");
  const [custoSalvando, setCustoSalvando] = useState(false);
  const [custoErro, setCustoErro] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("categories")
      .select("id, name")
      .eq("type", "saida")
      .eq("scope", "harmonize")
      .order("name")
      .then(({ data }) => setCategoriasSaida(data ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddCusto() {
    const valorCusto = valorParaNumero(custoValor);
    if (!custoCategoriaId || !valorCusto || valorCusto <= 0) {
      setCustoErro("Escolha a categoria e um valor maior que zero.");
      return;
    }
    setCustoSalvando(true);
    setCustoErro(null);
    const { error: rpcError } = await supabase.rpc("registrar_despesa_locacao", {
      p_rental_id: rental.id,
      p_category_id: custoCategoriaId,
      p_amount: valorCusto,
      p_payment_method: custoForma,
      p_date: rental.event_date,
      p_description: custoDescricao || null,
      p_notes: null,
    });
    setCustoSalvando(false);
    if (rpcError) {
      setCustoErro(rpcError.message || "Não foi possível lançar o custo.");
      return;
    }
    setCustoValor("");
    setCustoDescricao("");
    await carregarPagamentos();
    onPaymentsChanged?.();
  }

  async function carregarPagamentos() {
    setLoadingPayments(true);
    const [{ data: pagamentos }, { data: situacao }, { data: despesas }] = await Promise.all([
      supabase
        .from("rental_payments")
        .select("id, forma, valor, data, pix_conta")
        .eq("rental_id", rental.id)
        .order("data", { ascending: false }),
      supabase
        .from("rentals_situacao_pagamento")
        .select("saldo, credito_taxa")
        .eq("rental_id", rental.id)
        .maybeSingle(),
      supabase.from("transactions").select("amount").eq("rental_id", rental.id).eq("type", "saida"),
    ]);
    setTotalDespesas((despesas ?? []).reduce((acc, d: any) => acc + Number(d.amount ?? 0), 0));
    setPayments(pagamentos ?? []);
    setSaldoDevedor(situacao?.saldo ?? null);
    setCreditoTaxa(Number(situacao?.credito_taxa ?? 0));
    setLoadingPayments(false);
  }

  useEffect(() => {
    carregarPagamentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAddPayment() {
    const valorNumber = valorParaNumero(novoValor);
    if (!valorNumber || valorNumber <= 0) {
      setPaymentError("Informe um valor válido.");
      return;
    }
    setAddingPayment(true);
    setPaymentError(null);

    const { error: rpcError } = await supabase.rpc("registrar_pagamento_locacao", {
      p_rental_id: rental.id,
      p_forma: novaForma,
      p_valor: valorNumber,
      p_pix_conta: novaForma === "pix" ? novaPixConta : null,
    });

    setAddingPayment(false);

    if (rpcError) {
      setPaymentError(rpcError.message || "Não foi possível registrar o pagamento.");
      return;
    }

    setNovoValor("");
    await carregarPagamentos();
    onPaymentsChanged?.();
  }

  async function handleRemovePayment(paymentId: string) {
    if (!window.confirm("Remover este pagamento? O lançamento no caixa também será apagado.")) return;
    setPaymentError(null);
    const { error: rpcError } = await supabase.rpc("remover_pagamento_locacao", {
      p_payment_id: paymentId,
    });
    if (rpcError) {
      setPaymentError(rpcError.message || "Não foi possível remover o pagamento.");
      return;
    }
    await carregarPagamentos();
    onPaymentsChanged?.();
  }

  const shotsNumber = Number(shots.replace(/\D/g, ""));

  const suggestedValue = useMemo(() => {
    if (!shotsNumber || shotsNumber <= 0) return null;
    try {
      return calculateRentalValue(shotsNumber, pricingConfig).totalValue;
    } catch {
      return null;
    }
  }, [shotsNumber, pricingConfig]);

  function usarValorSugerido() {
    if (suggestedValue !== null) setValor(String(suggestedValue));
  }

  async function handleSave() {
    const valorNumber = valorParaNumero(valor);
    if (!clientId) {
      setError("Selecione o cliente.");
      return;
    }
    if (!equipmentId || !eventDate || !shotsNumber || !valorNumber) {
      setError("Preencha equipamento, data, disparos e valor.");
      return;
    }
    if (isPeriodo && (!eventDateEnd || eventDateEnd < eventDate)) {
      setError("Informe uma data final válida (igual ou depois da data inicial).");
      return;
    }
    if (!window.confirm("Salvar essas alterações na locação?")) return;
    setSaving(true);
    setError(null);

    // Cliente trocado primeiro (leva P.2): se falhar, não chega a mexer
    // no resto — evita salvar equipamento/data/valor novos numa locação
    // que ficou com o cliente errado por causa de um erro no meio.
    if (clientId !== currentClientId) {
      const { error: transferError } = await supabase.rpc("transferir_cliente_locacao", {
        p_rental_id: rental.id,
        p_novo_client_id: clientId,
      });
      if (transferError) {
        setSaving(false);
        setError("Não foi possível trocar o cliente desta locação. Tente novamente.");
        return;
      }
    }

    const { error: rpcError } = await supabase.rpc("update_rental", {
      p_rental_id: rental.id,
      p_equipment_id: equipmentId,
      p_event_date: eventDate,
      p_shots: shotsNumber,
      p_calculated_value: valorNumber,
      p_payment_method: rental.payment_method,
      p_status: status,
      p_notes: notes || null,
      p_event_date_end: isPeriodo ? eventDateEnd : null,
    });

    if (rpcError) {
      setSaving(false);
      if (rpcError.code === "23P01") {
        setError("⚠️ Esse equipamento já está reservado nessa data.");
      } else {
        setError(rpcError.message || "Não foi possível salvar. Tente novamente.");
      }
      return;
    }

    // Deslocamento (leva O/Y): sempre grava de novo, mesmo com km 0 —
    // é o jeito de também LIMPAR um deslocamento lançado antes por
    // engano, não só de adicionar um novo. Falha aqui não desfaz o resto
    // já salvo, só avisa.
    const { error: deslocamentoError } = await supabase.rpc("definir_deslocamento_locacao", {
      p_rental_id: rental.id,
      p_km_ida: kmIdaNumber > 0 ? kmIdaNumber : null,
      p_valor_deslocamento: valorDeslocamentoNumber,
      p_incluso_no_valor: inclusoNoValor,
    });

    setSaving(false);

    if (deslocamentoError) {
      setError("A locação foi salva, mas o deslocamento não foi atualizado. Tente ajustar de novo.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl dark:bg-neutral-900/85 sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">Editar locação</h2>

        <div className="space-y-3">
          <div>
            <ClientPicker clients={clientOptions} value={clientId} onChange={setClientId} onClientCreated={(c) => setClientOptions((prev) => [...prev, c])} />
            {clientId !== currentClientId && (
              <p className="mt-1 text-xs text-amber-600">
                ⚠️ Isso muda o cliente desta locação — o financeiro e o evento na Agenda ligados a ela mudam junto.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Equipamento</label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Data</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={isPeriodo}
                onChange={(e) => {
                  setIsPeriodo(e.target.checked);
                  if (!e.target.checked) setEventDateEnd("");
                }}
                className="h-4 w-4 rounded border-neutral-300 dark:border-neutral-700"
              />
              Locação de período (mais de um dia)
            </label>
            {isPeriodo && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Até</label>
                <input
                  type="date"
                  value={eventDateEnd}
                  min={eventDate}
                  onChange={(e) => setEventDateEnd(e.target.value)}
                  className="w-full max-w-[200px] rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Disparos</label>
            <input
              inputMode="numeric"
              value={shots}
              onChange={(e) => setShots(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-400">Valor final</label>
              {suggestedValue !== null && (
                <button
                  type="button"
                  onClick={usarValorSugerido}
                  className="text-xs text-brand-teal underline underline-offset-2"
                >
                  Usar sugerido: {formatCurrency(suggestedValue)}
                </button>
              )}
            </div>
            <input
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Editável à parte, já que cobranças adicionais e descontos aplicados na criação não ficam guardados separadamente.
            </p>
          </div>

          {/* Pagamentos (leva O): lista o que já foi recebido e permite
              lançar novos valores (parciais ou o restante), em formas
              diferentes, sem travar a locação como "paga" até o saldo
              zerar. Substitui o antigo campo único "Forma de pagamento". */}
          <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Pagamentos recebidos</label>
              {saldoDevedor !== null && (
                <span className={`text-xs font-semibold ${saldoDevedor > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {saldoDevedor > 0 ? `Saldo em aberto: ${formatCurrency(saldoDevedor)}` : "Quitada"}
                </span>
              )}
            </div>

            {loadingPayments ? (
              <p className="text-xs text-neutral-400">Carregando...</p>
            ) : payments.length === 0 ? (
              <p className="text-xs text-neutral-400">Nenhum pagamento lançado ainda.</p>
            ) : (
              <ul className="mb-2 space-y-1">
                {payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-300">
                    <span>
                      {formatCurrency(p.valor)} — {PAYMENT_METHODS.find((m) => m.value === p.forma)?.label ?? p.forma}
                      {p.pix_conta ? ` (${p.pix_conta})` : ""} · {new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                    <button
                      onClick={() => handleRemovePayment(p.id)}
                      className="text-xs text-red-500 underline underline-offset-2"
                    >
                      remover
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-neutral-500">Valor</label>
                <input
                  inputMode="decimal"
                  value={novoValor}
                  onChange={(e) => setNovoValor(e.target.value)}
                  placeholder="0,00"
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-neutral-500">Forma</label>
                <select
                  value={novaForma}
                  onChange={(e) => setNovaForma(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                >
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              {novaForma === "pix" && (
                <div className="flex-1">
                  <label className="mb-1 block text-xs text-neutral-500">Conta</label>
                  <select
                    value={novaPixConta}
                    onChange={(e) => setNovaPixConta(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
                  >
                    <option value="eder">Eder</option>
                    <option value="harmonize">Harmonize</option>
                    <option value="laser_dream">Laser Dream</option>
                  </select>
                </div>
              )}
              <button
                onClick={handleAddPayment}
                disabled={addingPayment}
                className="rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
              >
                {addingPayment ? "..." : "+ Add"}
              </button>
            </div>
            {paymentError && <p className="mt-2 text-xs text-red-500">{paymentError}</p>}
          </div>

          {!loadingPayments && (
            <div className="rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-700">
              <p className="mb-1 text-xs font-medium text-neutral-600 dark:text-neutral-400">Lucro líquido desta locação</p>
              <div className="space-y-0.5 text-neutral-700 dark:text-neutral-300">
                <div className="flex justify-between"><span>Recebido da locação{creditoTaxa > 0 ? " (inclui taxa de reserva)" : ""}</span><span>{formatCurrency(totalRecebido)}</span></div>
                {ajudaCustoLancada > 0 && (
                  <div className="flex justify-between"><span>Ajuda de custo (deslocamento)</span><span>{formatCurrency(ajudaCustoLancada)}</span></div>
                )}
                <div className="flex justify-between"><span>Custos (gasolina etc.)</span><span>− {formatCurrency(totalDespesas)}</span></div>
                <div className={`flex justify-between border-t border-neutral-200 pt-1 font-semibold dark:border-neutral-700 ${lucroLiquido >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  <span>Lucro líquido</span><span>{formatCurrency(lucroLiquido)}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Lançar custo desta locação</p>
                <select
                  value={custoCategoriaId}
                  onChange={(e) => setCustoCategoriaId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="">Categoria do custo...</option>
                  {categoriasSaida.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    inputMode="decimal"
                    value={custoValor}
                    onChange={(e) => setCustoValor(e.target.value.replace(/[^\d,]/g, ""))}
                    placeholder="R$ 0,00"
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  />
                  <select
                    value={custoForma}
                    onChange={(e) => setCustoForma(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  value={custoDescricao}
                  onChange={(e) => setCustoDescricao(e.target.value)}
                  placeholder="Descrição (opcional)"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                />
                {custoErro && <p className="text-xs text-red-500">{custoErro}</p>}
                <button
                  type="button"
                  onClick={handleAddCusto}
                  disabled={custoSalvando}
                  className="w-full rounded-lg border border-neutral-300 py-2 text-xs font-medium text-neutral-600 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-300"
                >
                  {custoSalvando ? "Lançando..." : "+ Lançar custo"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Ajuda de custo — deslocamento (opcional)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500 dark:text-neutral-400">R$</span>
              <input
                inputMode="decimal"
                value={valorDeslocamento}
                onChange={(e) => setValorDeslocamento(e.target.value.replace(/[^\d,]/g, ""))}
                placeholder="0,00"
                className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Valor que o cliente pagou de ajuda de custo pelo deslocamento, cobrado à parte do valor da locação. Entra
              no financeiro como entrada "Deslocamento" (mesma forma de pagamento e data da locação), mas não conta no
              faturamento. Deixe em branco (ou zere) para remover.
            </p>
            {valorDeslocamentoNumber > 0 && (
              <label className="mt-2 flex items-start gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={inclusoNoValor}
                  onChange={(e) => setInclusoNoValor(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Esse valor já está somado no valor da locação (veio da calculadora). Marcado, não lança no
                  financeiro, para não contar duas vezes.
                </span>
              </label>
            )}
            <label className="mb-1 mt-2 block text-xs font-medium text-neutral-500 dark:text-neutral-500">
              Km de ida (opcional, só para registro — não calcula o valor acima)
            </label>
            <input
              inputMode="numeric"
              value={kmIda}
              onChange={(e) => setKmIda(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
          </div>

          {status === "cancelada" ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800/50 dark:text-neutral-400">
              Esta locação está cancelada. Para reativar, use "Reativar" na lista de agendamentos deste cliente.
            </p>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}

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

        {status !== "cancelada" && (
          showCancelForm ? (
            <div className="mt-3 rounded-xl border border-red-200 p-3 dark:border-red-900/50">
              <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={cancelNoShow}
                  onChange={(e) => setCancelNoShow(e.target.checked)}
                />
                O cliente não compareceu (no-show)
              </label>
              {cancelError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{cancelError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setShowCancelForm(false)}
                  className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Voltar
                </button>
                <button
                  onClick={handleCancelarLocacao}
                  disabled={cancelling}
                  className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-medium text-white disabled:opacity-60"
                >
                  {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCancelForm(true)}
              className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 dark:border-red-900/50 dark:text-red-400"
            >
              Cancelar locação
            </button>
          )
        )}
      </div>
    </div>
  );
}
