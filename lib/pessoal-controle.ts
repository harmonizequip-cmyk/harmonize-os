// ============================================================
// CONTROLE PESSOAL (17/10/2026): as contas por trás da tela Pessoal > Início.
// Funções puras (testadas): resumo do mês com projeção, comparação por
// categoria com a média dos 3 meses anteriores e os avisos de "Precisa de
// você" do Pessoal. Compra no cartão conta no mês em que a fatura vence (todas no
// dia do vencimento), por isso entra na projeção pelo valor cheio, sem ser esticada
// pelo ritmo do mês; empréstimo e pagamento de fatura ficam fora (mesma regra de
// lib/relatorio-financeiro).
// ============================================================

import { contaNoResultado, type LinhaFinanceira } from "./relatorio-financeiro";
import { formatCurrency } from "./format";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function diasDoMes(hoje: string): number {
  const [a, m] = hoje.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

/** "AAAA-MM" do mês `desvio` meses antes (ou depois) do mês de `hoje`. */
export function mesComDesvio(hoje: string, desvio: number): string {
  const [a, m] = hoje.split("-").map(Number);
  const t = a * 12 + (m - 1) + desvio;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

function somaSaidas(linhas: LinhaFinanceira[], filtro: (l: LinhaFinanceira) => boolean): number {
  return linhas.filter((l) => l.type === "saida" && contaNoResultado(l) && filtro(l)).reduce((s, l) => s + Number(l.amount), 0);
}

export interface ResumoMesPessoal {
  entradas: number;
  saidas: number;
  sobrou: number;
  /** Saídas do mês passado só até o mesmo dia de hoje (comparação justa). */
  saidasMesPassadoAteHoje: number;
  /** Variação das saídas contra o mesmo ponto do mês passado; null sem base. */
  variacao: number | null;
  dia: number;
  diasNoMes: number;
  /** Quanto as saídas devem fechar no mês, no ritmo de hoje. */
  projecaoSaidas: number;
  /** Entradas menos a projeção das saídas. */
  projecaoSobra: number;
}

export function resumoDoMes(linhas: LinhaFinanceira[], hoje: string): ResumoMesPessoal {
  const mes = hoje.slice(0, 7);
  const passado = mesComDesvio(hoje, -1);
  const dia = Number(hoje.slice(8, 10));
  const total = diasDoMes(hoje);
  const doMes = linhas.filter((l) => l.date.slice(0, 7) === mes);
  const entradas = doMes.filter((l) => l.type === "entrada" && contaNoResultado(l)).reduce((s, l) => s + Number(l.amount), 0);
  const saidas = somaSaidas(doMes, () => true);
  // A fatura do cartão já é o valor do mês: só o resto segue o ritmo dos dias.
  const cartao = somaSaidas(doMes, (l) => l.cartao_mov === "compra");
  const passadoAteHoje = somaSaidas(linhas, (l) => l.date.slice(0, 7) === passado && Number(l.date.slice(8, 10)) <= dia);
  const projecao = dia >= 1 ? cartao + ((saidas - cartao) / dia) * total : saidas;
  return {
    entradas: r2(entradas),
    saidas: r2(saidas),
    sobrou: r2(entradas - saidas),
    saidasMesPassadoAteHoje: r2(passadoAteHoje),
    variacao: passadoAteHoje > 0 ? (saidas - passadoAteHoje) / passadoAteHoje : null,
    dia,
    diasNoMes: total,
    projecaoSaidas: r2(projecao),
    projecaoSobra: r2(entradas - projecao),
  };
}

export interface ComparacaoCategoria {
  categoria: string;
  atual: number;
  /** Média mensal dos 3 meses anteriores (mês sem gasto conta zero). */
  media: number;
  /** (atual - média) / média; null quando não há média. */
  variacao: number | null;
  /** Parte do atual que veio da fatura do cartão (já é o valor do mês, não se projeta). */
  cartao: number;
}

/** Gasto por categoria no mês contra a média dos 3 meses anteriores, maior gasto primeiro. */
export function comparacaoPorCategoria(linhas: LinhaFinanceira[], hoje: string): ComparacaoCategoria[] {
  const mes = hoje.slice(0, 7);
  const anteriores = new Set([mesComDesvio(hoje, -1), mesComDesvio(hoje, -2), mesComDesvio(hoje, -3)]);
  const atual = new Map<string, number>();
  const doCartao = new Map<string, number>();
  const passado = new Map<string, number>();
  for (const l of linhas) {
    if (l.type !== "saida" || !contaNoResultado(l)) continue;
    const nome = l.categoria ?? "Sem categoria";
    const m = l.date.slice(0, 7);
    if (m === mes) {
      atual.set(nome, (atual.get(nome) ?? 0) + Number(l.amount));
      if (l.cartao_mov === "compra") doCartao.set(nome, (doCartao.get(nome) ?? 0) + Number(l.amount));
    } else if (anteriores.has(m)) passado.set(nome, (passado.get(nome) ?? 0) + Number(l.amount));
  }
  return Array.from(atual.entries())
    .map(([categoria, v]) => {
      const media = (passado.get(categoria) ?? 0) / 3;
      return { categoria, atual: r2(v), media: r2(media), variacao: media > 0 ? (v - media) / media : null, cartao: r2(doCartao.get(categoria) ?? 0) };
    })
    .sort((a, b) => b.atual - a.atual);
}

export interface FaturaPessoal {
  cartao: string;
  vencimento: string; // AAAA-MM-DD
  falta: number;
}

export interface AvisoPessoal {
  id: string;
  icone: "fatura" | "alta" | "saldo" | "lancar" | "projecao" | "orcamento";
  texto: string;
  detalhe?: string;
  href: string;
  nivel: "urgente" | "atencao" | "info";
}

export interface OrcamentoPessoal {
  categoria: string;
  limite: number;
}

export interface UsoOrcamento {
  categoria: string;
  limite: number;
  gasto: number;
  /** gasto / limite (1 = 100%). */
  pct: number;
}

const chave = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Quanto de cada orçamento mensal já foi usado neste mês, o mais estourado primeiro. */
export function usoDosOrcamentos(orcamentos: OrcamentoPessoal[], linhas: LinhaFinanceira[], hoje: string): UsoOrcamento[] {
  const mes = hoje.slice(0, 7);
  const gasto = new Map<string, number>();
  for (const l of linhas) {
    if (l.type !== "saida" || !contaNoResultado(l) || l.date.slice(0, 7) !== mes) continue;
    const k = chave(l.categoria ?? "Sem categoria");
    gasto.set(k, (gasto.get(k) ?? 0) + Number(l.amount));
  }
  return orcamentos
    .filter((o) => o.limite > 0)
    .map((o) => {
      const g = r2(gasto.get(chave(o.categoria)) ?? 0);
      return { categoria: o.categoria, limite: o.limite, gasto: g, pct: g / o.limite };
    })
    .sort((a, b) => b.pct - a.pct);
}

function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10));
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export function avisosPessoais({
  linhas,
  hoje,
  saldo,
  faturas,
  totalFixas,
  ultimoLancamento,
  orcamentos = [],
}: {
  linhas: LinhaFinanceira[];
  hoje: string;
  saldo: number;
  faturas: FaturaPessoal[];
  totalFixas: number;
  /** Data (AAAA-MM-DD) do último lançamento feito, de qualquer mês; null se nunca. */
  ultimoLancamento: string | null;
  orcamentos?: OrcamentoPessoal[];
}): AvisoPessoal[] {
  const avisos: AvisoPessoal[] = [];
  const resumo = resumoDoMes(linhas, hoje);

  // Faturas dos cartões: vencida é urgente; até 5 dias é atenção.
  for (const f of faturas) {
    if (f.falta <= 0.009) continue;
    const dias = diasEntre(hoje, f.vencimento);
    if (dias < 0) {
      avisos.push({
        id: `fatura-${f.cartao}-${f.vencimento}`,
        icone: "fatura",
        texto: `Fatura do ${f.cartao} vencida há ${-dias} ${dias === -1 ? "dia" : "dias"}`,
        detalhe: `${formatCurrency(f.falta)} em aberto`,
        href: "/pessoal/cartoes",
        nivel: "urgente",
      });
    } else if (dias <= 5) {
      avisos.push({
        id: `fatura-${f.cartao}-${f.vencimento}`,
        icone: "fatura",
        texto: dias === 0 ? `Fatura do ${f.cartao} vence hoje` : `Fatura do ${f.cartao} vence em ${dias} ${dias === 1 ? "dia" : "dias"}`,
        detalhe: formatCurrency(f.falta),
        href: "/pessoal/cartoes",
        nivel: "atencao",
      });
    }
  }

  if (saldo < 0) {
    avisos.push({
      id: "saldo-negativo",
      icone: "saldo",
      texto: "Saldo da conta pessoal negativo",
      detalhe: `${formatCurrency(saldo)}. Confira se falta lançar uma entrada ou uma retirada.`,
      href: "/pessoal/lancamentos",
      nivel: "urgente",
    });
  }

  // Compromissos que ainda vão sair (faturas abertas + contas fixas) contra o saldo.
  const faturasAbertas = faturas.filter((f) => f.falta > 0.009).reduce((s, f) => s + f.falta, 0);
  const compromissos = faturasAbertas + totalFixas;
  if (saldo >= 0 && compromissos > 0 && compromissos > saldo) {
    avisos.push({
      id: "compromissos",
      icone: "saldo",
      texto: "Faturas e contas fixas passam do saldo",
      detalhe: `Somam ${formatCurrency(compromissos)} e o saldo é ${formatCurrency(saldo)}.`,
      href: "/pessoal/cartoes",
      nivel: "atencao",
    });
  }

  // Ritmo do mês: só depois do dia 7, quando a projeção já diz alguma coisa.
  if (resumo.dia >= 7 && resumo.entradas > 0 && resumo.projecaoSobra < 0) {
    avisos.push({
      id: "projecao",
      icone: "projecao",
      texto: "No ritmo de hoje, o mês fecha no vermelho",
      detalhe: `Saídas projetadas ${formatCurrency(resumo.projecaoSaidas)} contra ${formatCurrency(resumo.entradas)} que entraram.`,
      href: "/pessoal/relatorios",
      nivel: "atencao",
    });
  }

  // Categorias bem acima da média (precisa de histórico, de dia 7 em diante e de uma diferença que valha).
  if (resumo.dia >= 7) {
    const projetar = resumo.diasNoMes / resumo.dia;
    for (const c of comparacaoPorCategoria(linhas, hoje)) {
      if (c.variacao === null || c.media < 50) continue;
      const projetado = c.cartao + (c.atual - c.cartao) * projetar;
      if (projetado > c.media * 1.3 && projetado - c.media >= 100 && c.atual > c.media * 0.5) {
        const pct = Math.round((projetado / c.media - 1) * 100);
        avisos.push({
          id: `alta-${c.categoria}`,
          icone: "alta",
          texto: `${c.categoria} está ${pct}% acima da média`,
          detalhe: `${formatCurrency(c.atual)} até agora; costuma fechar o mês em ${formatCurrency(c.media)}.`,
          href: "/pessoal/relatorios",
          nivel: "info",
        });
      }
    }
  }

  // Orçamento por categoria: passou de 80% do limite avisa; passou de 100% é urgente.
  for (const u of usoDosOrcamentos(orcamentos, linhas, hoje)) {
    if (u.pct < 0.8) continue;
    const estourou = u.pct >= 1;
    avisos.push({
      id: `orcamento-${u.categoria}`,
      icone: "orcamento",
      texto: estourou ? `${u.categoria} passou do orçamento do mês` : `${u.categoria} já usou ${Math.round(u.pct * 100)}% do orçamento`,
      detalhe: `${formatCurrency(u.gasto)} de ${formatCurrency(u.limite)}`,
      href: "/pessoal/relatorios",
      nivel: estourou ? "urgente" : "atencao",
    });
  }

  // Hábito: sem lançar há dias, o controle deixa de refletir a realidade.
  const semLancar = ultimoLancamento ? diasEntre(ultimoLancamento, hoje) : null;
  if (semLancar !== null && semLancar >= 5) {
    avisos.push({
      id: "lancar",
      icone: "lancar",
      texto: `Faz ${semLancar} dias sem lançar nada`,
      detalhe: "Lance os gastos que ficaram para trás para o controle bater com a vida real.",
      href: "/pessoal/lancamentos",
      nivel: "info",
    });
  }

  return avisos;
}
