import { describe, expect, it } from "vitest";
import { CADENCIA, LIMITE_DIARIO, classificarTodas, valorPorFaturamento, type PessoaBase } from "./relacionamento";
import { DEFAULT_PREFERENCIAS } from "./preferencias";

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

describe("classificação com configuração própria", () => {
  const base = DEFAULT_PREFERENCIAS.relacionamento;

  it("sem configuração usa os padrões (CADENCIA e LIMITE_DIARIO derivam deles)", () => {
    expect(CADENCIA.ativa).toBe(21);
    expect(LIMITE_DIARIO).toBe(8);
  });

  it("sumidaDias menor faz a cliente virar sumida antes", () => {
    const p = pessoa({ locacoes: [{ data: "2026-05-01", valor: 1000 }, { data: "2026-06-01", valor: 1000 }] }); // 138 dias
    expect(classificarTodas([p], HOJE)[0].classe).toBe("sumida");
    const [c] = classificarTodas([pessoa({ locacoes: [{ data: "2026-08-10", valor: 1000 }, { data: "2026-09-01", valor: 1000 }] })], HOJE, { ...base, sumidaDias: 30 });
    expect(c.classe).toBe("sumida"); // 46 dias
    expect(classificarTodas([pessoa({ locacoes: [{ data: "2026-08-10", valor: 1000 }, { data: "2026-09-01", valor: 1000 }] })], HOJE)[0].classe).not.toBe("sumida");
  });

  it("cadência diferente muda quando a pessoa entra em chamar hoje", () => {
    const p = pessoa({ locacoes: [{ data: "2026-10-01", valor: 2500 }], ultimoContato: "2026-10-12" }); // 5 dias sem contato
    expect(classificarTodas([p], HOJE)[0].devida).toBe(false);
    const [c] = classificarTodas([p], HOJE, { ...base, cadencia: { ...base.cadencia, nova: 4 } });
    expect(c.cadencia).toBe(4);
    expect(c.devida).toBe(true);
  });

  it("novaAteDias e riscoSemRitmoDias mudam a classe", () => {
    const p = pessoa({ locacoes: [{ data: "2026-08-17", valor: 1000 }] }); // 61 dias, 1 locação
    expect(classificarTodas([p], HOJE)[0].classe).toBe("em_risco");
    expect(classificarTodas([p], HOJE, { ...base, novaAteDias: 90 })[0].classe).toBe("nova");
    expect(classificarTodas([p], HOJE, { ...base, riscoSemRitmoDias: 100 })[0].classe).toBe("ativa");
  });

  it("vipFatia e frequenteFatia mudam a curva", () => {
    const totais = new Map([["a", 600], ["b", 300], ["c", 100]]);
    expect(valorPorFaturamento(totais).get("b")).toBe("boa");
    expect(valorPorFaturamento(totais, { ...base, vipFatia: 0.7 }).get("b")).toBe("vip");
  });
});
