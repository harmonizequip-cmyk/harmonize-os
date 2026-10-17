import { describe, expect, it } from "vitest";
import { avisosPessoais, comparacaoPorCategoria, diasDoMes, mesComDesvio, resumoDoMes, usoDosOrcamentos } from "./pessoal-controle";
import type { LinhaFinanceira } from "./relatorio-financeiro";

const HOJE = "2026-10-15";
const s = (date: string, amount: number, categoria = "Mercado"): LinhaFinanceira => ({ type: "saida", amount, date, categoria });
const e = (date: string, amount: number): LinhaFinanceira => ({ type: "entrada", amount, date, categoria: "Retirada da Harmonize" });

describe("datas", () => {
  it("dias do mês e mês anterior", () => {
    expect(diasDoMes("2026-02-10")).toBe(28);
    expect(diasDoMes("2026-10-15")).toBe(31);
    expect(mesComDesvio("2026-01-10", -1)).toBe("2025-12");
    expect(mesComDesvio("2026-10-10", -3)).toBe("2026-07");
  });
});

describe("resumo do mês", () => {
  it("soma, compara com o mesmo ponto do mês passado e projeta", () => {
    const linhas = [e("2026-10-05", 5000), s("2026-10-03", 600), s("2026-10-12", 900), s("2026-09-04", 500), s("2026-09-20", 3000)];
    const r = resumoDoMes(linhas, HOJE);
    expect(r.entradas).toBe(5000);
    expect(r.saidas).toBe(1500);
    expect(r.sobrou).toBe(3500);
    expect(r.saidasMesPassadoAteHoje).toBe(500); // o gasto de 20/09 ainda não conta
    expect(r.variacao).toBeCloseTo(2, 5); // +200%
    expect(r.projecaoSaidas).toBe(3100); // 1500 / 15 * 31
  });

  it("ignora empréstimo e pagamento de fatura", () => {
    const linhas: LinhaFinanceira[] = [
      s("2026-10-03", 100),
      { type: "saida", amount: 2000, date: "2026-10-04", categoria: "Pagamento de fatura", cartao_mov: "pagamento" },
    ];
    expect(resumoDoMes(linhas, HOJE).saidas).toBe(100);
  });
});

describe("comparação por categoria", () => {
  it("usa a média dos 3 meses anteriores", () => {
    const linhas = [s("2026-07-10", 300), s("2026-08-10", 300), s("2026-09-10", 300), s("2026-10-05", 600)];
    const [c] = comparacaoPorCategoria(linhas, HOJE);
    expect(c.categoria).toBe("Mercado");
    expect(c.media).toBe(300);
    expect(c.variacao).toBeCloseTo(1, 5);
  });
});

describe("avisos", () => {
  const base = { linhas: [] as LinhaFinanceira[], hoje: HOJE, saldo: 1000, faturas: [], totalFixas: 0, ultimoLancamento: "2026-10-14" };

  it("fatura vencida é urgente e a que vence em breve é atenção", () => {
    const a = avisosPessoais({
      ...base,
      faturas: [
        { cartao: "Nubank", vencimento: "2026-10-10", falta: 800 },
        { cartao: "Inter", vencimento: "2026-10-18", falta: 300 },
        { cartao: "Itaú", vencimento: "2026-11-20", falta: 50 },
      ],
    });
    expect(a.find((x) => x.id.includes("Nubank"))?.nivel).toBe("urgente");
    expect(a.find((x) => x.id.includes("Inter"))?.nivel).toBe("atencao");
    expect(a.some((x) => x.id.includes("Itaú"))).toBe(false);
  });

  it("saldo negativo é urgente", () => {
    expect(avisosPessoais({ ...base, saldo: -50 }).some((x) => x.id === "saldo-negativo" && x.nivel === "urgente")).toBe(true);
  });

  it("categoria bem acima da média avisa", () => {
    const linhas = [s("2026-07-10", 1000), s("2026-08-10", 1000), s("2026-09-10", 1000), s("2026-10-10", 1500)];
    const a = avisosPessoais({ ...base, linhas });
    expect(a.some((x) => x.id === "alta-Mercado")).toBe(true);
  });

  it("projeção no vermelho só depois do dia 7 e com entradas", () => {
    const linhas = [e("2026-10-02", 3000), s("2026-10-05", 2500), s("2026-10-12", 1500)];
    expect(avisosPessoais({ ...base, linhas }).some((x) => x.id === "projecao")).toBe(true);
    expect(avisosPessoais({ ...base, linhas, hoje: "2026-10-05" }).some((x) => x.id === "projecao")).toBe(false);
  });

  it("lembra de lançar depois de 5 dias", () => {
    expect(avisosPessoais({ ...base, ultimoLancamento: "2026-10-08" }).some((x) => x.id === "lancar")).toBe(true);
    expect(avisosPessoais({ ...base }).some((x) => x.id === "lancar")).toBe(false);
  });

  it("sem nada fora do normal, não avisa", () => {
    expect(avisosPessoais(base)).toEqual([]);
  });
});

describe("orçamento por categoria", () => {
  const linhas = [s("2026-10-03", 450, "Restaurantes"), s("2026-10-09", 300, "Mercado"), s("2026-09-09", 900, "Mercado")];
  const orcs = [
    { categoria: "restaurantes", limite: 500 },
    { categoria: "Mercado", limite: 2000 },
  ];

  it("soma só o mês e ignora maiúscula e acento", () => {
    const [a, b] = usoDosOrcamentos(orcs, linhas, HOJE);
    expect(a.categoria).toBe("restaurantes");
    expect(a.gasto).toBe(450);
    expect(a.pct).toBeCloseTo(0.9, 5);
    expect(b.gasto).toBe(300);
  });

  it("avisa a partir de 80% e é urgente quando estoura", () => {
    const base = { linhas, hoje: HOJE, saldo: 1000, faturas: [], totalFixas: 0, ultimoLancamento: "2026-10-14" };
    const a = avisosPessoais({ ...base, orcamentos: orcs });
    expect(a.find((x) => x.id === "orcamento-restaurantes")?.nivel).toBe("atencao");
    expect(a.some((x) => x.id === "orcamento-Mercado")).toBe(false);
    const b = avisosPessoais({ ...base, orcamentos: [{ categoria: "Restaurantes", limite: 400 }] });
    expect(b.find((x) => x.id === "orcamento-Restaurantes")?.nivel).toBe("urgente");
  });
});
