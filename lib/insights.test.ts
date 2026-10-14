import { describe, expect, it } from "vitest";
import { categoriaInfo, ordenarInsights, perguntaParaAprofundar, type Insight } from "./insights";

const base = (p: Partial<Insight>): Insight => ({
  id: "x",
  categoria: "vendas",
  titulo: "t",
  texto: "x",
  acao: null,
  evidencia: null,
  impacto: 2,
  client_ids: [],
  status: "novo",
  util: null,
  created_at: "2026-10-14T10:00:00Z",
  ...p,
});

describe("insights", () => {
  it("ordena novos por impacto e deixa feitos e arquivados no fim", () => {
    const r = ordenarInsights([
      base({ id: "feito", status: "feito", impacto: 3 }),
      base({ id: "baixo", impacto: 1 }),
      base({ id: "arq", status: "arquivado" }),
      base({ id: "alto", impacto: 3 }),
      base({ id: "medio-novo", impacto: 2, created_at: "2026-10-15T10:00:00Z" }),
    ]);
    expect(r.map((i) => i.id)).toEqual(["alto", "medio-novo", "baixo", "feito", "arq"]);
  });

  it("categoria desconhecida cai em Operação", () => {
    expect(categoriaInfo("xyz").rotulo).toBe("Operação");
    expect(categoriaInfo("financeiro").rotulo).toBe("Financeiro");
  });

  it("monta a pergunta para o assistente com título e ação, até 500 caracteres", () => {
    const p = perguntaParaAprofundar({ titulo: "Reativar 7 clientes", acao: "Mandar mensagem" });
    expect(p).toContain("Reativar 7 clientes");
    expect(p).toContain("Mandar mensagem");
    expect(perguntaParaAprofundar({ titulo: "a".repeat(800), acao: null }).length).toBeLessThanOrEqual(500);
  });
});
