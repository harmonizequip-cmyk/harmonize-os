// ============================================================
// HARMONIZE OS — Calculadora unificada de locação (leva 2)
// ============================================================
// Suporte de cálculo para o CalculadoraLocacaoModal: junta a fórmula real
// de precificação (lib/rental-pricing.ts) com os recursos novos da leva O
// (pagamento múltiplo/parcial, deslocamento, custo por disparo negociado)
// e monta o texto de resumo para copiar/enviar no WhatsApp.
//
// Substitui lib/rental-summary.ts (usado só pelos dois modais antigos,
// removidos nesta leva) por uma versão que também sabe de itens
// personalizados (+ / -) e de mais de um pagamento por locação.
// ============================================================

import type {
  RentalPricingBreakdown,
  MentoriaPricingBreakdown,
} from "./rental-pricing";
import { RESERVATION_FEE } from "./rental-pricing";

export const PAYMENT_METHODS = [
  { value: "pix", label: "PIX" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "transferencia", label: "Transferência" },
  { value: "outros", label: "Outros" },
] as const;

export const PAYMENT_LABELS: Record<string, string> = Object.fromEntries(
  PAYMENT_METHODS.map((p) => [p.value, p.label])
);

// As três contas PIX reais do negócio (ver rental_payments.pix_conta no
// banco — lista fechada de propósito, igual lá). Nome/chave usados só para
// exibir na tela e no texto de WhatsApp.
export const PIX_CONTAS = [
  { value: "eder", nome: "Eder Campos de Almeida", chave: "07442790623" },
  { value: "harmonize", nome: "Harmonize Bella Prime LTDA", chave: "harmonizequip@gmail.com" },
  { value: "laser_dream", nome: "Laser Dream Campina Grande LTDA", chave: "ed21011f-1880-4293-9cb3-cdc087ac80de" },
] as const;

export type PixContaValue = (typeof PIX_CONTAS)[number]["value"];

export type ReservationFeeStatus = "nao_aplica" | "ja_paga" | "cobrar_agora";

export interface ItemAjuste {
  id: string;
  desc: string;
  valor: number;
  tipo: "mais" | "menos";
}

export interface PagamentoLinha {
  id: string;
  forma: string;
  valor: number;
  // Só relevante quando forma === "pix".
  pixConta: PixContaValue | "";
  // Data em que o pagamento entrou de fato (PIX caiu, cartão passou,
  // dinheiro foi recebido) — independente da data do HIPRO/evento
  // (rentals.event_date). Nasce com a data de hoje (mesma regra do
  // default do banco em registrar_pagamento_locacao), mas é editável:
  // um pagamento pode chegar dias antes ou depois do evento.
  data: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Deslocamento (leva O): R$ 50 a cada 50 km de ida e volta, arredondando
// pela regra dos 25 km (ex: 60 km de ida = 120 km ida+volta -> arredonda
// para 100 -> R$ 100; 70 km de ida = 140 km -> arredonda para 150 -> R$ 150).
// kmIda é só a distância de ida, digitada uma vez (a volta é assumida
// igual) — ver comentário de rentals.km_ida no schema.
export function calcularValorDeslocamento(kmIda: number): number {
  if (!kmIda || kmIda <= 0) return 0;
  const idaEVolta = kmIda * 2;
  const blocosDe50 = Math.round(idaEVolta / 50);
  return blocosDe50 * 50;
}

export interface ResumoLocacaoInput {
  isMentoria: boolean;
  // Modo disparo:
  shots: number;
  pricing: RentalPricingBreakdown | null;
  // Override de leva O: preço por disparo negociado manualmente, em vez da
  // tabela em faixas. null = usa a tabela (pricing.totalValue).
  custoManualPorDisparo: number | null;
  // Modo mentoria:
  mentoriaPricing: MentoriaPricingBreakdown | null;

  kmIda: number;
  itens: ItemAjuste[];

  reservationFeeStatus: ReservationFeeStatus;
  reservationFee: number;
}

export interface ResumoLocacao {
  // Valor "de tabela" dos disparos/mentoria, sem o custo negociado.
  subtotalTabela: number;
  // Valor efetivo do produto (disparos ou mentoria), já considerando o
  // custo negociado quando houver.
  subtotalProduto: number;
  economiaCustoManual: number; // subtotalTabela - subtotalProduto, só faz sentido em modo disparo com override
  valorDeslocamento: number;
  totalItensMais: number;
  totalItensMenos: number;
  creditoTaxa: number;
  taxaACobrarAgora: number;
  // O que vira o `calculated_value` da locação (rentals.calculated_value),
  // já líquido do crédito de taxa paga antes.
  valorLocacao: number;
  // valorLocacao + taxaACobrarAgora (a taxa entra como transação própria,
  // separada de rental_payments — ver comentário no componente).
  totalAPagarAgora: number;
}

export function calcularResumoLocacao(input: ResumoLocacaoInput): ResumoLocacao {
  const subtotalTabela = input.isMentoria
    ? input.mentoriaPricing?.totalValue ?? 0
    : input.pricing?.totalValue ?? 0;

  const subtotalProduto =
    !input.isMentoria && input.custoManualPorDisparo != null
      ? round2(input.shots * input.custoManualPorDisparo)
      : subtotalTabela;

  const economiaCustoManual = round2(subtotalTabela - subtotalProduto);
  const valorDeslocamento = calcularValorDeslocamento(input.kmIda);

  const totalItensMais = round2(
    input.itens.filter((i) => i.tipo === "mais").reduce((acc, i) => acc + i.valor, 0)
  );
  const totalItensMenos = round2(
    input.itens.filter((i) => i.tipo === "menos").reduce((acc, i) => acc + i.valor, 0)
  );

  const creditoTaxa = input.reservationFeeStatus === "ja_paga" ? input.reservationFee : 0;
  const taxaACobrarAgora = input.reservationFeeStatus === "cobrar_agora" ? input.reservationFee : 0;

  const bruto = subtotalProduto + valorDeslocamento + totalItensMais - totalItensMenos;
  const valorLocacao = Math.max(0, round2(bruto - creditoTaxa));
  const totalAPagarAgora = round2(valorLocacao + taxaACobrarAgora);

  return {
    subtotalTabela,
    subtotalProduto,
    economiaCustoManual,
    valorDeslocamento,
    totalItensMais,
    totalItensMenos,
    creditoTaxa,
    taxaACobrarAgora,
    valorLocacao,
    totalAPagarAgora,
  };
}

function fmtInt(n: number): string {
  return n.toLocaleString("pt-BR");
}
function fmtMoney(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtRate(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}
function fmtDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("pt-BR");
}

export interface ResumoWhatsAppInput extends ResumoLocacaoInput {
  initialCount: number;
  finalCount: number;
  patientCount: number;
  clientName: string;
  eventDate: string;
  pagamentos: PagamentoLinha[];
}

// Monta o texto de resumo (mesmo formato do protótipo aprovado, com
// disparos/mentoria + deslocamento + itens personalizados + pagamento(s) +
// PIX), pronto para copiar ou mandar direto no WhatsApp.
export function buildResumoWhatsApp(input: ResumoWhatsAppInput, resumo: ResumoLocacao): string {
  const linhas: string[] = [];
  linhas.push(input.isMentoria ? "🌿 *HARMONIZE — Resumo de Mentoria*" : "🌿 *HARMONIZE — Resumo de Disparos*");
  linhas.push("_Locação de Equipamentos Médicos e Estéticos_");
  linhas.push("━━━━━━━━━━━━━━━━━━━━━");
  linhas.push("");

  if (input.isMentoria && input.mentoriaPricing) {
    linhas.push("👥 *PACIENTES MODELO*");
    linhas.push(`  • Quantidade: ${fmtInt(input.patientCount)}`);
    linhas.push(
      `  • Valor por paciente${input.mentoriaPricing.isParcelado ? " (parcelado no crédito até 10x)" : " (à vista)"}: ${fmtMoney(
        input.mentoriaPricing.unitValue
      )}`
    );
    linhas.push(`  ▸ *Subtotal mentoria: ${fmtMoney(resumo.subtotalProduto)}*`);
  } else if (input.pricing) {
    const { config } = input.pricing;
    linhas.push("📊 *CONTAGEM DO EQUIPAMENTO*");
    linhas.push(`  • Contagem inicial: ${fmtInt(input.initialCount)}`);
    linhas.push(`  • Contagem final:   ${fmtInt(input.finalCount)}`);
    linhas.push(`  • Disparos realizados: *${fmtInt(input.shots)}*`);
    linhas.push("");
    linhas.push("💡 *VALOR DOS DISPAROS*");
    if (input.custoManualPorDisparo != null) {
      linhas.push(`  🤝 Custo negociado: R$ ${fmtRate(input.custoManualPorDisparo)} / disparo`);
      linhas.push(`  ${fmtInt(input.shots)} x R$ ${fmtRate(input.custoManualPorDisparo)} = *${fmtMoney(resumo.subtotalProduto)}*`);
      linhas.push(`  Valor pela tabela normal: ${fmtMoney(resumo.subtotalTabela)}`);
      linhas.push(`  ✅ Economia: *${fmtMoney(resumo.economiaCustoManual)}*`);
    } else {
      linhas.push(`  Pacote fixo (até ${fmtInt(config.flatPackageLimit)}): ${fmtMoney(input.pricing.flatPackageValue)}`);
      if (input.pricing.tier2Portion > 0) {
        linhas.push(
          `  Excedente ${fmtInt(config.flatPackageLimit + 1)}–${fmtInt(config.tier2Limit)}: ${fmtInt(
            input.pricing.tier2Portion
          )} x R$ ${fmtRate(config.tier2Rate)} = ${fmtMoney(input.pricing.tier2Value)}`
        );
      }
      if (input.pricing.tier3Portion > 0) {
        linhas.push(
          `  Excedente acima de ${fmtInt(config.tier2Limit)}: ${fmtInt(input.pricing.tier3Portion)} x R$ ${fmtRate(
            config.tier3Rate
          )} = ${fmtMoney(input.pricing.tier3Value)}`
        );
      }
    }
    linhas.push(`  ▸ *Subtotal disparos: ${fmtMoney(resumo.subtotalProduto)}*`);
  }

  if (resumo.valorDeslocamento > 0) {
    linhas.push("");
    linhas.push("🚗 *DESLOCAMENTO*");
    linhas.push(`  • ${fmtInt(input.kmIda)} km de ida (${fmtInt(input.kmIda * 2)} km ida e volta): + ${fmtMoney(resumo.valorDeslocamento)}`);
  }

  const itensMais = input.itens.filter((i) => i.tipo === "mais");
  if (itensMais.length > 0) {
    linhas.push("");
    linhas.push("➕ *COBRANÇAS ADICIONAIS*");
    for (const it of itensMais) linhas.push(`  • ${it.desc}: + ${fmtMoney(it.valor)}`);
    linhas.push(`  ▸ *Total de cobranças: + ${fmtMoney(resumo.totalItensMais)}*`);
  }

  const itensMenos = input.itens.filter((i) => i.tipo === "menos");
  if (itensMenos.length > 0) {
    linhas.push("");
    linhas.push("➖ *DESCONTOS*");
    for (const it of itensMenos) linhas.push(`  • ${it.desc}: - ${fmtMoney(it.valor)}`);
    linhas.push(`  ▸ *Total de descontos: - ${fmtMoney(resumo.totalItensMenos)}*`);
  }

  if (resumo.creditoTaxa > 0) {
    linhas.push("");
    linhas.push("💳 *TAXA DE RESERVA*");
    linhas.push(`  • Já paga anteriormente: - ${fmtMoney(resumo.creditoTaxa)} (creditado)`);
  }
  if (resumo.taxaACobrarAgora > 0) {
    linhas.push("");
    linhas.push("💳 *TAXA DE RESERVA*");
    linhas.push(`  • A pagar agora: + ${fmtMoney(resumo.taxaACobrarAgora)}`);
  }

  linhas.push("");
  linhas.push("━━━━━━━━━━━━━━━━━━━━━");
  linhas.push(`💰 *TOTAL A PAGAR: ${fmtMoney(resumo.totalAPagarAgora)}*`);
  linhas.push("━━━━━━━━━━━━━━━━━━━━━");

  const pagamentosValidos = input.pagamentos.filter((p) => p.valor > 0);
  if (pagamentosValidos.length > 0) {
    linhas.push("");
    linhas.push("💵 *PAGAMENTO*");
    for (const p of pagamentosValidos) {
      const contaTxt = p.forma === "pix" && p.pixConta ? ` (${PIX_CONTAS.find((c) => c.value === p.pixConta)?.nome})` : "";
      linhas.push(`  • ${PAYMENT_LABELS[p.forma] ?? p.forma}${contaTxt}: ${fmtMoney(p.valor)}`);
    }
    const somaPagamentos = round2(pagamentosValidos.reduce((acc, p) => acc + p.valor, 0));
    const saldo = round2(resumo.totalAPagarAgora - somaPagamentos);
    if (saldo > 0.009) {
      linhas.push(`  ▸ *Saldo em aberto: ${fmtMoney(saldo)}*`);
    }
  } else {
    linhas.push("");
    linhas.push("💵 *Fica em aberto — a receber*");
  }

  // Chave PIX de quem vai receber (só a primeira conta PIX usada, se houver)
  const contaPix = pagamentosValidos.find((p) => p.forma === "pix" && p.pixConta)?.pixConta;
  if (contaPix) {
    const p = PIX_CONTAS.find((c) => c.value === contaPix);
    if (p) {
      linhas.push("");
      linhas.push("🔑 *PIX para pagamento*");
      linhas.push(`  Favorecido: *${p.nome}*`);
      linhas.push(`  Chave: *${p.chave}*`);
    }
  }

  linhas.push("");
  linhas.push(`📅 Data: ${fmtDate(input.eventDate)}`);
  linhas.push(`🏥 ${input.isMentoria ? "Cliente/mentorando" : "Cliente"}: ${input.clientName}`);
  linhas.push("━━━━━━━━━━━━━━━━━━━━━");

  return linhas.join("\n");
}

export { RESERVATION_FEE };
