import { describe, expect, it } from "vitest";
import { interpretarFala } from "./voz";

// 08/10/2026 é uma quinta-feira.
const HOJE = "2026-10-08";
const CLIENTES = [
  { id: "1", name: "YLKA SOUZA" },
  { id: "2", name: "FERNANDA MAIA" },
  { id: "3", name: "FERNANDA LIMA" },
  { id: "4", name: "THAYSA ARAÚJO" },
];

describe("interpretarFala", () => {
  it("tira 'tarefa', acha amanhã e a cliente", () => {
    const r = interpretarFala("tarefa cobrar a Ylka amanhã", CLIENTES, HOJE);
    expect(r).toEqual({ titulo: "Cobrar a Ylka", data: "2026-10-09", clienteId: "1", candidatos: [] });
  });

  it("sem data dita fica hoje", () => {
    expect(interpretarFala("ligar para o contador", CLIENTES, HOJE).data).toBe(HOJE);
  });

  it("depois de amanhã não vira amanhã", () => {
    expect(interpretarFala("buscar HIPRO depois de amanhã", CLIENTES, HOJE).data).toBe("2026-10-10");
  });

  it("dia da semana é sempre o próximo", () => {
    expect(interpretarFala("mandar contrato na sexta", CLIENTES, HOJE).data).toBe("2026-10-09");
    expect(interpretarFala("revisar na quinta-feira", CLIENTES, HOJE).data).toBe("2026-10-15");
    expect(interpretarFala("pagar boleto segunda", CLIENTES, HOJE).titulo).toBe("Pagar boleto");
  });

  it("dia do mês: se já passou, vai para o mês seguinte", () => {
    expect(interpretarFala("cobrar taxa dia 15", CLIENTES, HOJE).data).toBe("2026-10-15");
    expect(interpretarFala("cobrar taxa dia 3", CLIENTES, HOJE).data).toBe("2026-11-03");
    expect(interpretarFala("renovar dia 20 de novembro", CLIENTES, HOJE).data).toBe("2026-11-20");
    expect(interpretarFala("renovar 5/1", CLIENTES, HOJE).data).toBe("2027-01-05");
  });

  it("daqui a N dias, com número em palavra", () => {
    expect(interpretarFala("retornar daqui a três dias", CLIENTES, HOJE).data).toBe("2026-10-11");
    expect(interpretarFala("retornar em 10 dias", CLIENTES, HOJE).data).toBe("2026-10-18");
  });

  it("nome repetido sem sobrenome oferece as opções", () => {
    const r = interpretarFala("confirmar endereço da Fernanda", CLIENTES, HOJE);
    expect(r.clienteId).toBeNull();
    expect(r.candidatos.map((c) => c.id)).toEqual(["2", "3"]);
  });

  it("sobrenome desempata", () => {
    expect(interpretarFala("confirmar endereço da Fernanda Maia", CLIENTES, HOJE).clienteId).toBe("2");
  });

  it("acento no cadastro ou na fala não atrapalha", () => {
    expect(interpretarFala("enviar recibo thaysa araujo", CLIENTES, HOJE).clienteId).toBe("4");
  });
});

import { interpretarDespesa } from "./voz";

const CATEGORIAS = [
  { id: "c1", name: "Combustível" },
  { id: "c2", name: "Alimentação" },
  { id: "c3", name: "Hospedagem" },
  { id: "c4", name: "Estacionamento" },
  { id: "c5", name: "Outros" },
];

describe("interpretarDespesa", () => {
  const ctx = { categorias: CATEGORIAS, clientes: CLIENTES, hoje: HOJE };

  it("gasolina, valor, pix e data", () => {
    const r = interpretarDespesa("gasolina 150 reais no pix depois de amanhã", ctx);
    expect(r).toMatchObject({ valor: "150,00", forma: "pix", categoriaId: "c1", data: "2026-10-10", descricao: "Gasolina" });
  });

  it("centavos e cartão", () => {
    const r = interpretarDespesa("almoço em Recife 45,90 no cartão", ctx);
    expect(r).toMatchObject({ valor: "45,90", forma: "credito", categoriaId: "c2", descricao: "Almoço em Recife" });
  });

  it("reais e centavos falados, hotel, cliente", () => {
    const r = interpretarDespesa("despesa hotel da Ylka 280 reais e 50 centavos dinheiro", ctx);
    expect(r).toMatchObject({ valor: "280,50", forma: "dinheiro", categoriaId: "c3", clienteId: "1" });
  });

  it("dia do mês não vira valor", () => {
    const r = interpretarDespesa("estacionamento 20 reais dia 15", ctx);
    expect(r).toMatchObject({ valor: "20,00", data: "2026-10-15", categoriaId: "c4" });
  });

  it("milhar com ponto", () => {
    expect(interpretarDespesa("R$ 1.250,00 hospedagem", ctx).valor).toBe("1.250,00");
  });

  it("sem categoria reconhecida fica em branco", () => {
    const r = interpretarDespesa("presente para cliente 80 reais", ctx);
    expect(r.categoriaId).toBeNull();
    expect(r.valor).toBe("80,00");
  });
});
