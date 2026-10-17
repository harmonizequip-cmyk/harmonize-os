import { describe, expect, it } from "vitest";
import { classificarTodas, valorPorFaturamento, type PessoaBase } from "./relacionamento";

const HOJE = "2026-10-17";

function pessoa(p: Partial<PessoaBase>): PessoaBase {
  return {
    id: p.id ?? "x",
    nome: p.nome ?? "Dra. Ana",
    treatment: null,
    displayName: null,
    whatsapp: "83999999999",
    cidade: null,
    stage: p.stage ?? "cliente",
    ehCliente: p.ehCliente ?? true,
    parceiro: false,
    criadoEm: p.criadoEm ?? "2026-01-01",
    locacoes: p.locacoes ?? [],
    proximaReserva: p.proximaReserva ?? null,
    ultimoContato: p.ultimoContato ?? null,
    deve: 0,
    tarefasPendentes: 0,
  };
}

describe("classificação", () => {
  it("cliente com reserva futura é agendada e não entra na lista do dia", () => {
    const [c] = classificarTodas([pessoa({ locacoes: [{ data: "2026-05-01", valor: 1000 }], proximaReserva: "2026-10-30" })], HOJE);
    expect(c.classe).toBe("agendada");
    expect(c.devida).toBe(false);
  });

  it("primeira locação recente é nova e entra depois de 10 dias sem contato", () => {
    const [c] = classificarTodas([pessoa({ locacoes: [{ data: "2026-10-01", valor: 2500 }] })], HOJE);
    expect(c.classe).toBe("nova");
    expect(c.devida).toBe(true);
  });

  it("passou do ritmo dela vira em risco", () => {
    const [c] = classificarTodas(
      [pessoa({ locacoes: [{ data: "2026-06-01", valor: 1 }, { data: "2026-06-21", valor: 1 }, { data: "2026-07-11", valor: 1 }] })],
      HOJE
    );
    expect(c.ritmo).toBe(20);
    expect(c.classe).toBe("em_risco");
    expect(c.motivo).toContain("a cada 20 dias");
  });

  it("mais de 120 dias sem locar é sumida", () => {
    const [c] = classificarTodas([pessoa({ locacoes: [{ data: "2026-03-01", valor: 1 }, { data: "2026-05-01", valor: 1 }] })], HOJE);
    expect(c.classe).toBe("sumida");
  });

  it("contato recente tira da lista do dia", () => {
    const [c] = classificarTodas([pessoa({ locacoes: [{ data: "2026-10-01", valor: 1 }], ultimoContato: "2026-10-15" })], HOJE);
    expect(c.devida).toBe(false);
  });

  it("lead com interesse é quente; parado há mais de 14 dias é fria", () => {
    const l = classificarTodas(
      [
        pessoa({ id: "a", ehCliente: false, stage: "qualificado", criadoEm: "2026-10-01" }),
        pessoa({ id: "b", ehCliente: false, stage: "nutricao", criadoEm: "2026-08-01" }),
      ],
      HOJE
    );
    expect(l.find((p) => p.id === "a")?.classe).toBe("quente");
    expect(l.find((p) => p.id === "b")?.classe).toBe("fria");
  });
});

describe("valor por faturamento (curva ABC)", () => {
  it("quem faz a primeira metade do faturamento é VIP", () => {
    const v = valorPorFaturamento(new Map([["a", 600], ["b", 250], ["c", 100], ["d", 50]]));
    expect(v.get("a")).toBe("vip");
    expect(v.get("b")).toBe("boa");
    expect(v.get("c")).toBe("comum");
  });
});
