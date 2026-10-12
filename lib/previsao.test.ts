import { describe, it, expect } from "vitest";
import { preverCaixa, type ReservaFutura } from "./previsao";

const res = (o: Partial<ReservaFutura>): ReservaFutura => ({
  id: "x", data: "2026-10-20", clienteId: null, clienteNome: null, equipamento: "HIPRO 1", mentoria: false, taxaPaga: 0, ...o,
});

describe("preverCaixa", () => {
  const historico = [
    { clienteId: "ana", valor: 4000, despesas: 400, mentoria: false },
    { clienteId: "ana", valor: 2000, despesas: 200, mentoria: false },
    { clienteId: "bia", valor: 3000, despesas: 300, mentoria: false },
  ];
  const base = { hoje: "2026-10-12", fim: "2026-11-11", dias: 30, historico, aReceberVencido: 1000, fixasMensais: 5000 };

  it("usa a média do cliente, senão a geral, e desconta a taxa paga", () => {
    const p = preverCaixa({
      ...base,
      reservas: [res({ id: "1", clienteId: "ana", taxaPaga: 500 }), res({ id: "2", clienteId: "nova" })],
    });
    expect(p.reservas.map((r) => [r.base, r.estimado, r.aEntrar])).toEqual([
      ["cliente", 3000, 2500],
      ["media", 3000, 3000],
    ]);
    expect(p.entradasReservas).toBe(5500);
    expect(p.custosLocacoes).toBe(600); // 10% de 6000
    expect(p.contasFixas).toBe(5000);
    expect(p.saldo).toBe(5500 + 1000 - 600 - 5000);
  });

  it("fora do período não entra; 60 dias contam 2 meses de contas", () => {
    const p = preverCaixa({ ...base, dias: 60, fim: "2026-12-11", reservas: [res({ data: "2027-01-05" }), res({ data: "2026-10-01" })] });
    expect(p.reservas).toHaveLength(0);
    expect(p.contasFixas).toBe(10000);
  });

  it("faturas de cartão até o fim do período saem do saldo", () => {
    const p = preverCaixa({ ...base, reservas: [], faturas: [{ vencimento: "2026-11-05", valor: 800 }, { vencimento: "2026-12-05", valor: 900 }] });
    expect(p.faturasCartao).toBe(800);
    expect(p.saldo).toBe(1000 - 800 - 5000);
  });

  it("mentoria sem histórico fica sem estimativa", () => {
    const p = preverCaixa({ ...base, reservas: [res({ mentoria: true })] });
    expect(p.reservas[0]).toMatchObject({ base: "sem", estimado: 0 });
  });
});
