// Cartão de crédito. A compra conta como gasto no mês em que a fatura dela vence
// (transactions.date = vencimento; data_compra = dia da compra), mas não
// tira dinheiro da conta; o pagamento da fatura tira o dinheiro e não conta
// como gasto (as compras já contaram). Assim nada é somado duas vezes.

export type CartaoMov = "compra" | "pagamento" | null | undefined;

/** Fica fora de Entradas, Saídas e Resultado (só mexe no saldo). */
export function foraDoResultadoPorCartao(mov: CartaoMov): boolean {
  return mov === "pagamento";
}

/** Fica fora do saldo da conta (o dinheiro só sai quando paga a fatura). */
export function foraDoSaldoPorCartao(mov: CartaoMov): boolean {
  return mov === "compra";
}

/** Fica fora do saldo da conta: compra no cartão (sai na fatura) e permuta (não é dinheiro). */
export function foraDoSaldo(t: { cartao_mov?: CartaoMov; payment_method?: string | null }): boolean {
  return foraDoSaldoPorCartao(t.cartao_mov ?? null) || t.payment_method === "permuta";
}

/** Fatura (mês do vencimento, "AAAA-MM") em que cai uma compra. Espelha fatura_da_compra do banco. */
export function faturaDaCompra(data: string, fechamento: number, vencimento: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let ano = a;
  let mes = m;
  if (d > Math.min(fechamento, ultimoDia(a, m))) mes += 1;
  if (vencimento <= fechamento) mes += 1;
  while (mes > 12) {
    mes -= 12;
    ano += 1;
  }
  return `${ano}-${String(mes).padStart(2, "0")}`;
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** "2026-03" vira "mar/2026". */
export function rotuloFatura(ref: string): string {
  const [a, m] = ref.split("-").map(Number);
  return `${MESES[m - 1]}/${a}`;
}

/** Soma meses a "AAAA-MM". */
export function somarMesesRef(ref: string, n: number): string {
  const [a, m] = ref.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}
