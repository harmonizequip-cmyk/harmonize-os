// ============================================================
// QUADRO "ESTE MÊS" DO DASHBOARD
//
// Responde uma pergunta só: quanto ainda falta sobrar das locações deste mês
// para pagar as contas fixas (Configurações > Contas fixas do mês), e
// quantas locações isso representa.
//
// "Sobra" é o lucro da locação (valor cobrado menos as despesas lançadas
// nela: combustível, hotel, comida), da view rentals_lucro. Usar o valor
// bruto enganaria: uma locação de R$ 3.000 com R$ 600 de viagem paga
// R$ 2.400 de conta, não R$ 3.000.
// ============================================================

export type TipoDespesaFixa = "negocio" | "pessoal";

export interface DespesaFixa {
  nome: string;
  valor: number;
  tipo: TipoDespesaFixa;
}

/** Lê a lista gravada em settings.despesas_fixas, descartando item malformado. */
export function lerDespesasFixas(bruto: unknown): DespesaFixa[] {
  if (!Array.isArray(bruto)) return [];
  const lista: DespesaFixa[] = [];
  for (const item of bruto) {
    if (!item || typeof item !== "object") continue;
    const { nome, valor, tipo } = item as Record<string, unknown>;
    const numero = Number(valor);
    if (typeof nome !== "string" || !nome.trim() || !Number.isFinite(numero) || numero <= 0) continue;
    lista.push({ nome: nome.trim(), valor: Math.round(numero * 100) / 100, tipo: tipo === "pessoal" ? "pessoal" : "negocio" });
  }
  return lista;
}

export interface MetaDoMesEntrada {
  despesas: DespesaFixa[];
  /** Soma do lucro das locações com data neste mês (já finalizadas). */
  sobraDoMes: number;
  /** Quantas locações entraram nessa soma. */
  locacoesDoMes: number;
  /** Lucro médio por locação nos últimos meses; null sem histórico. */
  sobraMediaPorLocacao: number | null;
  /** Reservas deste mês, de hoje em diante, ainda sem disparos lançados. */
  reservasRestantes: number;
}

export interface MetaDoMes {
  totalFixas: number;
  totalNegocio: number;
  totalPessoal: number;
  sobraDoMes: number;
  falta: number;
  /** Quanto a sobra passou das contas (0 se ainda falta). */
  excedente: number;
  /** 0 a 1, para a barra de progresso. */
  progresso: number;
  /** Locações que ainda precisam acontecer para cobrir o que falta; null sem média. */
  locacoesQueFaltam: number | null;
  /** O que as reservas já marcadas devem render, pela média; null sem média. */
  previsaoDasReservas: number | null;
  /** Falta depois de contar as reservas já marcadas (0 = cobre). */
  faltaDepoisDasReservas: number | null;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

export function calcularMetaDoMes(e: MetaDoMesEntrada): MetaDoMes {
  const totalNegocio = centavos(e.despesas.filter((d) => d.tipo === "negocio").reduce((s, d) => s + d.valor, 0));
  const totalPessoal = centavos(e.despesas.filter((d) => d.tipo === "pessoal").reduce((s, d) => s + d.valor, 0));
  const totalFixas = centavos(totalNegocio + totalPessoal);
  const sobra = centavos(e.sobraDoMes);
  const falta = centavos(Math.max(0, totalFixas - sobra));
  const media = e.sobraMediaPorLocacao != null && e.sobraMediaPorLocacao > 0 ? e.sobraMediaPorLocacao : null;
  const previsao = media != null ? centavos(media * e.reservasRestantes) : null;
  return {
    totalFixas,
    totalNegocio,
    totalPessoal,
    sobraDoMes: sobra,
    falta,
    excedente: centavos(Math.max(0, sobra - totalFixas)),
    progresso: totalFixas > 0 ? Math.min(1, Math.max(0, sobra / totalFixas)) : 0,
    locacoesQueFaltam: falta === 0 ? 0 : media != null ? Math.ceil(falta / media) : null,
    previsaoDasReservas: previsao,
    faltaDepoisDasReservas: previsao != null ? centavos(Math.max(0, falta - previsao)) : null,
  };
}
