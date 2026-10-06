import { describe, it, expect } from "vitest";
import { calcularMetaDoMes, lerDespesasFixas } from "./meta-mes";

const fixas = [
  { nome: "Parcela HIPRO 2", valor: 5750, tipo: "negocio" as const },
  { nome: "Parcela HIPRO 1", valor: 4255, tipo: "negocio" as const },
  { nome: "Aluguel moradia", valor: 2250, tipo: "pessoal" as const },
];

describe("quadro Este mês", () => {
  it("falta = contas fixas menos a sobra das locações, e quantas locações cobrem", () => {
    const m = calcularMetaDoMes({ despesas: fixas, sobraDoMes: 4000, locacoesDoMes: 2, sobraMediaPorLocacao: 2500, reservasRestantes: 2 });
    expect(m.totalNegocio).toBe(10005);
    expect(m.totalPessoal).toBe(2250);
    expect(m.totalFixas).toBe(12255);
    expect(m.falta).toBe(8255);
    expect(m.locacoesQueFaltam).toBe(4); // 8255 / 2500 = 3,3 -> 4
    expect(m.previsaoDasReservas).toBe(5000);
    expect(m.faltaDepoisDasReservas).toBe(3255);
  });

  it("quando a sobra já cobre, falta zero e nenhuma locação a mais", () => {
    const m = calcularMetaDoMes({ despesas: fixas, sobraDoMes: 15000, locacoesDoMes: 5, sobraMediaPorLocacao: 3000, reservasRestantes: 0 });
    expect(m.falta).toBe(0);
    expect(m.locacoesQueFaltam).toBe(0);
    expect(m.progresso).toBe(1);
    expect(m.excedente).toBe(2745);
  });

  it("sem histórico não inventa número de locações", () => {
    const m = calcularMetaDoMes({ despesas: fixas, sobraDoMes: 0, locacoesDoMes: 0, sobraMediaPorLocacao: null, reservasRestantes: 3 });
    expect(m.locacoesQueFaltam).toBeNull();
    expect(m.previsaoDasReservas).toBeNull();
  });

  it("lista do banco descarta item malformado", () => {
    const l = lerDespesasFixas([{ nome: "A", valor: "100.5", tipo: "pessoal" }, { nome: "", valor: 10 }, { nome: "B", valor: -1 }, null, "x"]);
    expect(l).toEqual([{ nome: "A", valor: 100.5, tipo: "pessoal" }]);
    expect(lerDespesasFixas(null)).toEqual([]);
  });
});
