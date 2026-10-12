// Previsão de caixa dos próximos 30 ou 60 dias.
//
// As reservas ainda não têm valor (ele só existe quando a locação é
// finalizada com os disparos), então cada uma é estimada pela média das
// locações do próprio cliente ou, se ele nunca alugou, pela média geral. A
// taxa de reserva já paga sai do que falta entrar (ela é abatida do saldo).
// Custos da locação (combustível, hospedagem...) seguem a proporção das
// despesas sobre o faturamento das locações passadas. Contas fixas contam
// uma vez a cada 30 dias.

export interface ReservaFutura {
  id: string;
  data: string;
  clienteId: string | null;
  clienteNome: string | null;
  equipamento: string;
  mentoria: boolean;
  taxaPaga: number;
}

export interface LocacaoPassada {
  clienteId: string | null;
  valor: number;
  despesas: number;
  mentoria: boolean;
}

export type BaseEstimativa = "cliente" | "media" | "sem";

export interface ReservaPrevista extends ReservaFutura {
  estimado: number;
  aEntrar: number;
  base: BaseEstimativa;
}

export interface PrevisaoCaixa {
  dias: number;
  reservas: ReservaPrevista[];
  entradasReservas: number;
  aReceberVencido: number;
  custosLocacoes: number;
  faturasCartao: number;
  contasFixas: number;
  meses: number;
  saldo: number;
}

const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function preverCaixa(p: {
  hoje: string;
  fim: string;
  dias: number;
  reservas: ReservaFutura[];
  historico: LocacaoPassada[];
  aReceberVencido: number;
  fixasMensais: number;
  // Faturas de cartão da Harmonize ainda não pagas (o que falta de cada uma).
  faturas?: { vencimento: string; valor: number }[];
}): PrevisaoCaixa {
  const hipro = p.historico.filter((h) => !h.mentoria && h.valor > 0);
  const ment = p.historico.filter((h) => h.mentoria && h.valor > 0);
  const mediaHipro = media(hipro.map((h) => h.valor));
  const mediaMentoria = media(ment.map((h) => h.valor));
  const porCliente = new Map<string, number[]>();
  for (const h of hipro) {
    if (!h.clienteId) continue;
    porCliente.set(h.clienteId, [...(porCliente.get(h.clienteId) ?? []), h.valor]);
  }
  const faturado = p.historico.reduce((s, h) => s + h.valor, 0);
  const despesas = p.historico.reduce((s, h) => s + h.despesas, 0);
  const proporcaoCustos = faturado > 0 ? despesas / faturado : 0;

  const reservas: ReservaPrevista[] = p.reservas
    .filter((r) => r.data >= p.hoje && r.data <= p.fim)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
    .map((r) => {
      let estimado: number | null;
      let base: BaseEstimativa;
      const doCliente = !r.mentoria && r.clienteId ? media(porCliente.get(r.clienteId) ?? []) : null;
      if (doCliente != null) {
        estimado = doCliente;
        base = "cliente";
      } else {
        estimado = r.mentoria ? mediaMentoria : mediaHipro;
        base = estimado == null ? "sem" : "media";
      }
      const est = r2(estimado ?? 0);
      return { ...r, estimado: est, aEntrar: r2(Math.max(0, est - r.taxaPaga)), base };
    });

  const entradasReservas = r2(reservas.reduce((s, r) => s + r.aEntrar, 0));
  const custosLocacoes = r2(reservas.reduce((s, r) => s + r.estimado, 0) * proporcaoCustos);
  const meses = Math.max(1, Math.round(p.dias / 30));
  const contasFixas = r2(p.fixasMensais * meses);
  const aReceberVencido = r2(p.aReceberVencido);
  const faturasCartao = r2((p.faturas ?? []).filter((f) => f.vencimento <= p.fim).reduce((s, f) => s + f.valor, 0));
  return {
    dias: p.dias,
    reservas,
    entradasReservas,
    aReceberVencido,
    custosLocacoes,
    faturasCartao,
    contasFixas,
    meses,
    saldo: r2(entradasReservas + aReceberVencido - custosLocacoes - faturasCartao - contasFixas),
  };
}
