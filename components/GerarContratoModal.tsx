"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ContratoDados } from "@/lib/contrato-pdf";
import type { PricingConfig } from "@/lib/rental-pricing";
import { DEFAULT_PRICING } from "@/lib/rental-pricing";

const PAYMENT_LABELS: Record<string, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  transferencia: "Transferência",
  outros: "Outros",
};

const PAYMENT_OPTIONS = Object.entries(PAYMENT_LABELS) as [string, string][];

function formatPeriodo(eventDate: string, eventDateEnd?: string | null): string {
  if (eventDateEnd && eventDateEnd !== eventDate) {
    return `${formatDate(eventDate)} a ${formatDate(eventDateEnd)}`;
  }
  return formatDate(eventDate);
}

interface EquipamentoInfo {
  name: string;
  serial_number?: string | null;
  anvisa_registro?: string | null;
}

// Origem "rental": locação já lançada (disparos e valor já combinados,
// mesmo que para uma data futura) — fluxo original.
export interface RentalParaContrato {
  id: string;
  event_date: string;
  event_date_end?: string | null;
  shots: number;
  calculated_value: number;
  payment_method: string;
  equipment_id: string;
  equipments?: EquipamentoInfo | null;
}

// Origem "reserva": pré-reserva feita por "Agendar sem disparos"
// (calendar_events, status pre_reserva). Leva Y: o contrato precisa
// poder ser gerado e assinado ANTES do procedimento, quando disparos e
// valor ainda não existem — e a forma de pagamento, que nesse estágio
// também ainda não foi decidida, é escolhida na hora de gerar.
export interface ReservaParaContrato {
  id: string;
  event_date: string;
  event_date_end?: string | null;
  equipment_id: string;
  equipments?: EquipamentoInfo | null;
}

export type OrigemContrato =
  | { kind: "rental"; rental: RentalParaContrato }
  | { kind: "reserva"; reserva: ReservaParaContrato };

interface ClienteParaContrato {
  id: string;
  name: string;
  email?: string | null;
  document?: string | null;
  address?: string | null;
  display_name?: string | null;
  contrato_nome?: string | null;
  contrato_endereco?: string | null;
}

export default function GerarContratoModal({
  origem,
  client,
  pricingConfig,
  onClose,
}: {
  origem: OrigemContrato;
  client: ClienteParaContrato;
  // Precificação vigente (Configurações), usada para montar a cláusula
  // de valor do contrato. Cai no fallback só se a página não tiver
  // recebido a config real — não deve acontecer no uso normal.
  pricingConfig?: PricingConfig;
  onClose: () => void;
}) {
  const supabase = createClient();
  // Padrão: dado alternativo fixo do cadastro (contrato_nome/contrato_endereco),
  // senão o dado normal do cliente. Sempre editável só para esta geração,
  // sem alterar o cadastro (leva X — "os dois": padrão fixo + ajuste pontual).
  const [nome, setNome] = useState(client.contrato_nome || client.name);
  const [documento, setDocumento] = useState(client.document ?? "");
  const [endereco, setEndereco] = useState(client.contrato_endereco || client.address || "");
  // Quem assina pela parte contratante — por padrão a mesma pessoa do
  // nome (ou o nome de exibição, se houver um mais curto). Só muda de
  // fato quando o contratante é uma empresa e quem assina é outra pessoa.
  const [responsavel, setResponsavel] = useState(client.display_name || client.contrato_nome || client.name);
  const [email, setEmail] = useState(client.email ?? "");
  // Só existe pergunta de forma de pagamento numa pré-reserva: numa
  // locação já lançada, o pagamento já foi combinado e fica travado nela
  // (para mudar, edita a locação e gera de novo — leva Y não mexeu nisso).
  const [reservaPaymentMethod, setReservaPaymentMethod] = useState("");
  const [gerando, setGerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const equipamento = origem.kind === "rental" ? origem.rental.equipments : origem.reserva.equipments;
  const equipamentoNome = equipamento?.name ?? "-";
  const eventDate = origem.kind === "rental" ? origem.rental.event_date : origem.reserva.event_date;
  const eventDateEnd = origem.kind === "rental" ? origem.rental.event_date_end : origem.reserva.event_date_end;
  const paymentMethod = origem.kind === "rental" ? origem.rental.payment_method : reservaPaymentMethod;

  async function handleGerar() {
    if (!nome.trim()) {
      setError("Informe o nome/razão social do contratante.");
      return;
    }
    if (!documento.trim()) {
      setError("Informe o CPF/CNPJ do contratante.");
      return;
    }
    if (!responsavel.trim()) {
      setError("Informe quem assina pelo contratante.");
      return;
    }
    if (origem.kind === "reserva" && !reservaPaymentMethod) {
      setError("Selecione a forma de pagamento combinada.");
      return;
    }
    setError(null);
    setGerando(true);

    const dados: ContratoDados = {
      contratante: {
        nome: nome.trim(),
        documento: documento.trim(),
        endereco: endereco.trim() || null,
        responsavel: responsavel.trim(),
        email: email.trim() || null,
      },
      equipamento: {
        nome: equipamentoNome,
        serial_number: equipamento?.serial_number ?? null,
        anvisa_registro: equipamento?.anvisa_registro ?? null,
      },
      locacao: {
        event_date: eventDate,
        event_date_end: eventDateEnd ?? null,
        // Só existe quantidade/valor combinados quando a origem é uma
        // locação já lançada. Numa pré-reserva, o contrato descreve só a
        // tabela de tarifas vigente, sem fechar disparos nem valor.
        shots: origem.kind === "rental" ? origem.rental.shots : null,
        calculated_value: origem.kind === "rental" ? Number(origem.rental.calculated_value) : null,
        payment_method: paymentMethod,
      },
      // Retrato da precificação vigente agora, para a cláusula de valor
      // e para "baixar de novo" reproduzir o mesmo texto no futuro,
      // mesmo que a config mude depois em Configurações.
      precificacao: {
        flatPackageLimit: (pricingConfig ?? DEFAULT_PRICING).flatPackageLimit,
        flatPackageValue: (pricingConfig ?? DEFAULT_PRICING).flatPackageValue,
        tier2Limit: (pricingConfig ?? DEFAULT_PRICING).tier2Limit,
        tier2Rate: (pricingConfig ?? DEFAULT_PRICING).tier2Rate,
        tier3Rate: (pricingConfig ?? DEFAULT_PRICING).tier3Rate,
      },
      gerado_em: new Date().toISOString(),
    };

    // Registra ANTES de gerar o PDF: garante que o "controle dos
    // emitidos" reflete a intenção mesmo que o usuário cancele a caixa de
    // salvar do navegador depois — o registro é sobre o contrato ter sido
    // gerado, não sobre onde o arquivo baixado parou. Leva Y: a origem
    // decide se registra por locação ou por pré-reserva.
    const { error: rpcError } = await supabase.rpc(
      "registrar_contrato_emitido",
      origem.kind === "rental"
        ? { p_dados: dados, p_rental_id: origem.rental.id }
        : { p_dados: dados, p_reservation_id: origem.reserva.id }
    );

    if (rpcError) {
      setGerando(false);
      setError("Não foi possível registrar a emissão. Tente novamente.");
      return;
    }

    try {
      // Import dinâmico: @react-pdf/renderer é pesado, e a maioria das
      // visitas ao perfil do cliente nunca gera um contrato — carregar só
      // aqui, no momento do clique, evita inflar o carregamento inicial
      // da página inteira.
      const { gerarContratoPdfBlob, baixarPdfBlob, nomeArquivoContrato } = await import("@/lib/contrato-pdf");
      const blob = await gerarContratoPdfBlob(dados);
      baixarPdfBlob(blob, nomeArquivoContrato(dados));
      onClose();
    } catch {
      setError("O contrato foi registrado, mas houve um erro ao montar o PDF. Tente gerar de novo pelo controle de Contratos.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white/90 p-6 shadow-2xl backdrop-blur-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-semibold text-neutral-900">Gerar contrato</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Confira os dados de quem vai constar no contrato e na nota fiscal. Podem ser diferentes do cadastro do cliente —
          o que você ajustar aqui vale só para este contrato.
        </p>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Nome / Razão social
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">CPF/CNPJ</label>
            <input
              value={documento}
              onChange={(e) => setDocumento(e.target.value)}
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Endereço (opcional)
            </label>
            <input
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              Responsável / Signatário
            </label>
            <input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Quem assina pelo contratante"
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600">
              E-mail (opcional)
            </label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>

          {origem.kind === "reserva" && (
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-600">
                Forma de pagamento combinada
              </label>
              <select
                value={reservaPaymentMethod}
                onChange={(e) => setReservaPaymentMethod(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  Selecione
                </option>
                {PAYMENT_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="rounded-xl border border-neutral-200 p-3 text-xs text-neutral-600">
            <p className="mb-1.5 font-medium text-neutral-700">
              Dados da {origem.kind === "rental" ? "locação" : "pré-reserva"} (não editáveis aqui)
            </p>
            <p>Equipamento: {equipamentoNome}</p>
            <p>Período: {formatPeriodo(eventDate, eventDateEnd)}</p>
            {origem.kind === "rental" ? (
              <>
                <p>Disparos: {origem.rental.shots.toLocaleString("pt-BR")}</p>
                <p>Valor: {formatCurrency(Number(origem.rental.calculated_value))}</p>
                <p>Pagamento: {PAYMENT_LABELS[origem.rental.payment_method] ?? origem.rental.payment_method}</p>
              </>
            ) : (
              <p>Disparos e valor: a apurar no dia do procedimento, conforme a tabela de tarifas vigente.</p>
            )}
            <p className="mt-1.5 text-[11px] text-neutral-400">
              {origem.kind === "rental"
                ? "Para mudar algo disto, edite a locação e gere o contrato de novo."
                : "Esta é uma pré-reserva: o contrato descreve a tabela de tarifas em vigor, sem fechar quantidade ou valor final."}
            </p>
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
            onClick={handleGerar}
            disabled={gerando}
            className="flex-1 rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:hover:brightness-100"
          >
            {gerando ? "Gerando..." : "Gerar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
