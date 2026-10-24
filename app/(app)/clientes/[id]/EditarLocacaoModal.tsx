"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { paraEscolha } from "@/lib/categorias";
import { calculateRentalValue, type PricingConfig } from "@/lib/rental-pricing";
import { formatCurrency } from "@/lib/format";
import ClientPicker, { type ClientOption } from "@/components/ClientPicker";
import { valorParaNumero } from "@/lib/valor";
import { Atalho, Atalhos } from "@/components/Atalhos";
import { linkEvento, linkLancamento } from "@/lib/atalhos";
import { somarContagens, disparosCobrados } from "@/lib/creditos";
import { confirmar } from "@/components/Dialogos";
import { codigoPadrao, contaPorCodigo, contasParaEscolha } from "@/lib/contas-pix";
import { useContasPix } from "@/lib/usar-contas-pix";

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
  // Atendimento da Agenda ligado a esta locação (para o atalho).
  eventId?: string | null;
}

// Contagem em edição (texto nos campos; aplicador_id volta igual ao banco).
interface ContagemEdicao {
  inicial: string;
  final: string;
  gera_credito: boolean;
  aplicador_id: string | null;
}

function numeroDoCampo(v: string): number | null {
  const limpo = v.replace(/\D/g, "");
  return limpo === "" ? null : Number(limpo);
}

function contagensParaNumeros(lista: ContagemEdicao[]) {
  return lista.map((c) => ({
    inicial: numeroDoCampo(c.inicial),
    final: numeroDoCampo(c.final),
    gera_credito: c.gera_credito,
    aplicador_id: c.aplicador_id,
  }));
}

function chaveContagens(lista: ContagemEdicao[]): string {
  return JSON.stringify(contagensParaNumeros(lista));
}

interface RentalPayment {
  id: string;
  forma: string;
  valor: number;
  data: string;
  pix_conta: string | null;
  transaction_id: string | null;
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
  const contasPix = useContasPix();
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
  const [novaPixConta, setNovaPixConta] = useState(codigoPadrao(contasPix));
  const [addingPayment, setAddingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Lucro = o que de fato entrou (pagamentos, que cobrem também o deslocamento
  // cobrado à parte quando ele é pago) menos os custos ligados à locação.
  const totalRecebido = payments.reduce((acc, p) => acc + Number(p.valor ?? 0), 0) + creditoTaxa;
  const ajudaCustoLancada = rental.deslocamento_incluso_no_valor ? 0 : Number(rental.valor_deslocamento ?? 0);
  const lucroLiquido = totalRecebido - totalDespesas;

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
      .select("*")
      .eq("type", "saida")
      .eq("scope", "harmonize")
      .order("name")
      .then(({ data }) => setCategoriasSaida(paraEscolha(data)));
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
        .select("id, forma, valor, data, pix_conta, transaction_id")
        .eq("rental_id", rental.id)
        .order("data", { ascending: true }),
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
    if (!(await confirmar({ titulo: "Remover este pagamento?", texto: "O lançamento no caixa também será apagado.", confirmar: "Remover", perigo: true }))) return;
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

  // ------------------------------------------------------------
  // Contagens e crédito de disparos: a locação pode ter várias contagens
  // (uma por ponteira) e ter gerado ou usado crédito. Editar disparos aqui
  // refaz isso junto, por corrigir_contagens_locacao.
  // ------------------------------------------------------------
  const [carregandoCredito, setCarregandoCredito] = useState(true);
  const [contagens, setContagens] = useState<ContagemEdicao[]>([]);
  const [contagensOriginais, setContagensOriginais] = useState<ContagemEdicao[]>([]);
  const [creditoUsadoOriginal, setCreditoUsadoOriginal] = useState(0);
  const [creditoGeradoOriginal, setCreditoGeradoOriginal] = useState(0);
  const [creditoDisponivel, setCreditoDisponivel] = useState(0);
  const [creditoUsadoTexto, setCreditoUsadoTexto] = useState("0");

  useEffect(() => {
    (async () => {
      const [{ data: linhasContagem }, { data: linhasCredito }, { data: saldo }] = await Promise.all([
        supabase
          .from("locacao_contagens")
          .select("ordem, inicial, final, gera_credito, aplicador_id")
          .eq("rental_id", rental.id)
          .order("ordem", { ascending: true }),
        supabase
          .from("creditos_cliente")
          .select("quantidade, origem")
          .eq("rental_id", rental.id)
          .eq("tipo", "disparos")
          .in("origem", ["contagem", "uso"]),
        supabase.from("creditos_saldo").select("disparos_disponiveis").eq("client_id", currentClientId).maybeSingle(),
      ]);
      const lista: ContagemEdicao[] = (linhasContagem ?? []).map((c: any) => ({
        inicial: String(c.inicial ?? ""),
        final: String(c.final ?? ""),
        gera_credito: !!c.gera_credito,
        aplicador_id: c.aplicador_id ?? null,
      }));
      let usado = 0;
      let gerado = 0;
      for (const l of (linhasCredito ?? []) as { quantidade: number; origem: string }[]) {
        if (l.origem === "uso") usado += Math.abs(Number(l.quantidade ?? 0));
        else if (l.origem === "contagem") gerado += Number(l.quantidade ?? 0);
      }
      setContagens(lista);
      setContagensOriginais(lista);
      setCreditoUsadoOriginal(usado);
      setCreditoGeradoOriginal(gerado);
      setCreditoUsadoTexto(String(usado));
      setCreditoDisponivel(Math.max(0, Number((saldo as any)?.disparos_disponiveis ?? 0)));
      setCarregandoCredito(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const porContagens = contagens.length > 0;
  const somaContagens = useMemo(
    () =>
      somarContagens(
        contagensParaNumeros(contagens).map((c) => ({
          inicial: c.inicial ?? NaN,
          final: c.final ?? NaN,
          gera_credito: c.gera_credito,
        }))
      ),
    [contagens]
  );
  const shotsCampo = Number(shots.replace(/\D/g, ""));
  // Total real de disparos (desgaste): soma das contagens, ou o campo único.
  const shotsNumber = porContagens ? somaContagens.total : shotsCampo;
  // Crédito só muda com contagens (a função do banco refaz tudo a partir delas).
  const podeMudarCredito = (porContagens || contagensOriginais.length > 0) && status !== "cancelada";
  const creditoUsado = podeMudarCredito ? numeroDoCampo(creditoUsadoTexto) ?? 0 : creditoUsadoOriginal;
  const limiteCredito = Math.max(0, Math.min(shotsNumber, creditoDisponivel + creditoUsadoOriginal));
  const shotsCobrados = disparosCobrados(shotsNumber, creditoUsado);
  const creditoGerado = porContagens || contagensOriginais.length > 0 ? somaContagens.credito : creditoGeradoOriginal;
  const contagensMudaram = chaveContagens(contagens) !== chaveContagens(contagensOriginais);
  const creditoMudou = creditoUsado !== creditoUsadoOriginal;

  function mudarContagem(i: number, campo: Partial<ContagemEdicao>) {
    setContagens((prev) => prev.map((c, j) => (j === i ? { ...c, ...campo } : c)));
  }

  function adicionarContagem() {
    setContagens((prev) => {
      const ultima = prev[prev.length - 1];
      // A próxima costuma começar onde a anterior parou.
      return [...prev, { inicial: ultima?.final ?? "", final: "", gera_credito: false, aplicador_id: null }];
    });
  }

  function tirarContagem(i: number) {
    const nova = contagens.filter((_, j) => j !== i);
    // Sem contagens volta o campo único, já com o total que havia.
    if (nova.length === 0) setShots(String(somaContagens.total || shotsCampo || ""));
    setContagens(nova);
  }

  const suggestedValue = useMemo(() => {
    if (!shotsCobrados || shotsCobrados <= 0) return null;
    try {
      return calculateRentalValue(shotsCobrados, pricingConfig).totalValue;
    } catch {
      return null;
    }
  }, [shotsCobrados, pricingConfig]);

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
    const contagensNumeros = contagensParaNumeros(contagens);
    const incompleta = contagensNumeros.findIndex((c) => c.inicial === null || c.final === null || c.inicial === c.final);
    if (incompleta >= 0) {
      setError(`Preencha a contagem ${incompleta + 1} (inicial e final diferentes) ou tire ela.`);
      return;
    }
    if (podeMudarCredito && creditoUsado > limiteCredito) {
      setError(`O crédito usado pode ser no máximo ${limiteCredito.toLocaleString("pt-BR")} disparos.`);
      return;
    }
    const precisaCorrigir =
      status !== "cancelada" && (porContagens || contagensOriginais.length > 0) && (contagensMudaram || creditoMudou);
    if (!(await confirmar({ titulo: "Salvar as alterações na locação?", confirmar: "Salvar" }))) return;
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

    if (precisaCorrigir) {
      const { error: contagemError } = await supabase.rpc("corrigir_contagens_locacao", {
        p_rental_id: rental.id,
        p_contagens: contagensNumeros.map((c) => ({
          inicial: c.inicial,
          final: c.final,
          gera_credito: c.gera_credito,
          ...(c.aplicador_id ? { aplicador_id: c.aplicador_id } : {}),
        })),
        p_credito_usado: creditoUsado,
      });
      if (contagemError) {
        setSaving(false);
        setError(
          `A locação foi salva, mas as contagens e o crédito não foram ajustados: ${
            contagemError.message || "tente de novo."
          }`
        );
        return;
      }
      setContagensOriginais(contagens);
      setCreditoUsadoOriginal(creditoUsado);
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-lg font-semibold text-neutral-900">Editar locação</h2>
        <Atalhos className="mb-4">
          {rental.eventId && (
            <Atalho href={linkEvento(rental.eventId)} emoji="📅">
              Atendimento na agenda
            </Atalho>
          )}
        </Atalhos>

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
            <label className="mb-1 block text-xs font-medium text-neutral-600">Equipamento</label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              {equipments.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">Data</label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-600">
              <input
                type="checkbox"
                checked={isPeriodo}
                onChange={(e) => {
                  setIsPeriodo(e.target.checked);
                  if (!e.target.checked) setEventDateEnd("");
                }}
                className="h-4 w-4 rounded border-neutral-300"
              />
              Locação de período (mais de um dia)
            </label>
            {isPeriodo && (
              <div className="mt-2">
                <label className="mb-1 block text-xs font-medium text-neutral-600">Até</label>
                <input
                  type="date"
                  value={eventDateEnd}
                  min={eventDate}
                  onChange={(e) => setEventDateEnd(e.target.value)}
                  className="w-full max-w-[200px] rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
              </div>
            )}
          </div>

          {porContagens ? (
            <div className="rounded-xl border border-neutral-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs font-medium text-neutral-600">Contagens</label>
                <span className="text-xs font-semibold text-neutral-700">
                  Total: {somaContagens.total.toLocaleString("pt-BR")} disparos
                </span>
              </div>
              <div className="space-y-2">
                {contagens.map((c, i) => (
                  <div key={i} className="rounded-lg bg-neutral-50 p-2">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">Contagem {i + 1}</span>
                      <button
                        type="button"
                        onClick={() => tirarContagem(i)}
                        disabled={status === "cancelada"}
                        className="text-xs text-red-500 underline underline-offset-2 disabled:opacity-50"
                      >
                        tirar
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-0.5 block text-[11px] text-neutral-500">Inicial</label>
                        <input
                          inputMode="numeric"
                          value={c.inicial}
                          disabled={status === "cancelada"}
                          onChange={(e) => mudarContagem(i, { inicial: e.target.value.replace(/\D/g, "") })}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] text-neutral-500">Final</label>
                        <input
                          inputMode="numeric"
                          value={c.final}
                          disabled={status === "cancelada"}
                          onChange={(e) => mudarContagem(i, { final: e.target.value.replace(/\D/g, "") })}
                          className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                        />
                      </div>
                    </div>
                    <label className="mt-1.5 flex items-center gap-2 text-xs text-neutral-600">
                      <input
                        type="checkbox"
                        checked={c.gera_credito}
                        disabled={status === "cancelada"}
                        onChange={(e) => mudarContagem(i, { gera_credito: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-300"
                      />
                      Vira crédito
                    </label>
                  </div>
                ))}
              </div>
              {contagens.length < 10 && status !== "cancelada" && (
                <button
                  type="button"
                  onClick={adicionarContagem}
                  className="mt-2 text-xs text-brand-teal underline underline-offset-2"
                >
                  + Adicionar contagem
                </button>
              )}
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Disparos</label>
              <input
                inputMode="numeric"
                value={shots}
                onChange={(e) => setShots(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              {!carregandoCredito && status !== "cancelada" && (
                <button
                  type="button"
                  onClick={() =>
                    setContagens([{ inicial: "", final: "", gera_credito: false, aplicador_id: null }])
                  }
                  className="mt-1 text-xs text-brand-teal underline underline-offset-2"
                >
                  Detalhar por contagens
                </button>
              )}
            </div>
          )}

          {!carregandoCredito && (podeMudarCredito || creditoUsadoOriginal > 0 || creditoDisponivel > 0) && (
            <div className="rounded-xl border border-neutral-200 p-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Crédito de disparos usado nesta locação
              </label>
              {podeMudarCredito ? (
                <>
                  <input
                    inputMode="numeric"
                    value={creditoUsadoTexto}
                    onChange={(e) => setCreditoUsadoTexto(e.target.value.replace(/\D/g, ""))}
                    className="w-32 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <p className="mt-1 text-xs text-neutral-400">
                    Até {limiteCredito.toLocaleString("pt-BR")} disparos (crédito da cliente mais o que esta locação já
                    usava, sem passar do total).
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-neutral-700">{creditoUsadoOriginal.toLocaleString("pt-BR")} disparos</p>
                  {status !== "cancelada" && (
                    <p className="mt-1 text-xs text-neutral-400">
                      Para mudar o crédito, toque em "Detalhar por contagens" e informe as contagens desta locação.
                    </p>
                  )}
                </>
              )}
              {creditoUsado > 0 && (
                <p className="mt-1 text-xs text-neutral-600">
                  Disparos cobrados: {shotsCobrados.toLocaleString("pt-BR")} ({shotsNumber.toLocaleString("pt-BR")} menos{" "}
                  {creditoUsado.toLocaleString("pt-BR")} de crédito)
                </p>
              )}
            </div>
          )}

          {!carregandoCredito && (creditoGerado > 0 || creditoUsado > 0) && (
            <div className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
              {creditoGerado > 0 && <p>Gerou {creditoGerado.toLocaleString("pt-BR")} disparos de crédito</p>}
              {creditoUsado > 0 && <p>Usou {creditoUsado.toLocaleString("pt-BR")} disparos de crédito</p>}
            </div>
          )}

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-neutral-600">Valor final</label>
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
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-400">
              Editável à parte, já que cobranças adicionais e descontos aplicados na criação não ficam guardados separadamente.
            </p>
          </div>

          {/* Pagamentos (leva O): lista o que já foi recebido e permite
              lançar novos valores (parciais ou o restante), em formas
              diferentes, sem travar a locação como "paga" até o saldo
              zerar. Substitui o antigo campo único "Forma de pagamento". */}
          <div className="rounded-xl border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-600">Pagamentos recebidos</label>
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
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm text-neutral-700">
                    <span>
                      {formatCurrency(p.valor)} — {PAYMENT_METHODS.find((m) => m.value === p.forma)?.label ?? p.forma}
                      {p.pix_conta ? ` (${contaPorCodigo(contasPix, p.pix_conta)?.rotulo ?? p.pix_conta})` : ""} · {new Date(p.data + "T00:00:00").toLocaleDateString("pt-BR")}
                    </span>
                    {p.transaction_id && (
                      <Atalho href={linkLancamento(p.transaction_id)} emoji="💰" title="Abrir o lançamento no Financeiro">
                        Lançamento
                      </Atalho>
                    )}
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
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-neutral-500">Forma</label>
                <select
                  value={novaForma}
                  onChange={(e) => setNovaForma(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
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
                    className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  >
                    {contasParaEscolha(contasPix, novaPixConta).map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.rotulo}
                      </option>
                    ))}
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
            <div className="rounded-xl border border-neutral-200 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-neutral-600">Lucro líquido desta locação</p>
              <div className="space-y-0.5 text-neutral-700">
                <div className="flex justify-between"><span>Recebido da locação{creditoTaxa > 0 ? " (inclui taxa de reserva)" : ""}</span><span>{formatCurrency(totalRecebido)}</span></div>
                {ajudaCustoLancada > 0 && (
                  <p className="text-xs text-neutral-500">
                    O deslocamento cobrado à parte ({formatCurrency(ajudaCustoLancada)}) soma no saldo a receber e entra aqui quando for pago.
                  </p>
                )}
                <div className="flex justify-between"><span>Custos (gasolina etc.)</span><span>− {formatCurrency(totalDespesas)}</span></div>
                <div className={`flex justify-between border-t border-neutral-200 pt-1 font-semibold ${lucroLiquido >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  <span>Lucro líquido</span><span>{formatCurrency(lucroLiquido)}</span>
                </div>
              </div>
              <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3">
                <p className="text-xs font-medium text-neutral-600">Lançar custo desta locação</p>
                <select
                  value={custoCategoriaId}
                  onChange={(e) => setCustoCategoriaId(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                  />
                  <select
                    value={custoForma}
                    onChange={(e) => setCustoForma(e.target.value)}
                    className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
                />
                {custoErro && <p className="text-xs text-red-500">{custoErro}</p>}
                <button
                  type="button"
                  onClick={handleAddCusto}
                  disabled={custoSalvando}
                  className="w-full rounded-lg border border-neutral-300 py-2 text-xs font-medium text-neutral-600 disabled:opacity-60"
                >
                  {custoSalvando ? "Lançando..." : "+ Lançar custo"}
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Ajuda de custo — deslocamento (opcional)
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-500">R$</span>
              <input
                inputMode="decimal"
                value={valorDeslocamento}
                onChange={(e) => setValorDeslocamento(e.target.value.replace(/[^\d,]/g, ""))}
                placeholder="0,00"
                className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Ajuda de custo do deslocamento, cobrada à parte do valor da locação. Soma no saldo a receber e entra no
              caixa quando a cliente pagar (pelo Receber pagamento). Conta no lucro da locação. Deixe em branco (ou
              zere) para remover.
            </p>
            {valorDeslocamentoNumber > 0 && (
              <label className="mt-2 flex items-start gap-2 text-xs text-neutral-500">
                <input
                  type="checkbox"
                  checked={inclusoNoValor}
                  onChange={(e) => setInclusoNoValor(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Esse valor já está somado no valor da locação (veio da calculadora). Marcado, não soma de novo no saldo, para não cobrar duas vezes.
                </span>
              </label>
            )}
            <label className="mb-1 mt-2 block text-xs font-medium text-neutral-500">
              Km de ida (opcional, só para registro — não calcula o valor acima)
            </label>
            <input
              inputMode="numeric"
              value={kmIda}
              onChange={(e) => setKmIda(e.target.value.replace(/\D/g, ""))}
              placeholder="0"
              className="w-28 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {status === "cancelada" ? (
            <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
              Esta locação está cancelada. Para reativar, use "Reativar" na lista de agendamentos deste cliente.
            </p>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
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
            <label className="mb-1 block text-xs font-medium text-neutral-600">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-neutral-300 py-2.5 text-sm font-medium text-neutral-600"
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
            <div className="mt-3 rounded-xl border border-red-200 p-3">
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Motivo do cancelamento (opcional)
              </label>
              <textarea
                value={cancelMotivo}
                onChange={(e) => setCancelMotivo(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              />
              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                <input
                  type="checkbox"
                  checked={cancelNoShow}
                  onChange={(e) => setCancelNoShow(e.target.checked)}
                />
                O cliente não compareceu (no-show)
              </label>
              {cancelError && <p className="mt-2 text-xs text-red-600">{cancelError}</p>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setShowCancelForm(false)}
                  className="flex-1 rounded-xl border border-neutral-300 py-2 text-xs font-medium text-neutral-600"
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
              className="mt-3 w-full rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600"
            >
              Cancelar locação
            </button>
          )
        )}
      </div>
    </div>
  );
}
