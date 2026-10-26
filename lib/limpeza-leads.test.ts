import { describe, expect, it } from "vitest";
import {
  FILTROS_VAZIOS,
  LIMITE_RODADA,
  alternarSelecao,
  dataLocalDe,
  explicarErro,
  filtrarLeads,
  marcarFiltrados,
  montarCopia,
  motivoParaNaoApagar,
  motivosDeFora,
  nomeArquivoCopia,
  ordenarLeads,
  podarSelecao,
  resumoExclusao,
  temHistorico,
  textoCopia,
  type LeadLimpeza,
} from "./limpeza-leads";

function lead(p: Partial<LeadLimpeza> & { id: string }): LeadLimpeza {
  return {
    nome: `Lead ${p.id}`,
    apelido: null,
    cidade: null,
    whatsapp: "81999990000",
    etapa: "lead",
    origem: "instagram",
    criadoEm: "2026-05-01",
    tarefas: 0,
    anotacoes: 0,
    envios: 0,
    naoQuer: false,
    indicou: 0,
    cadastro: { id: p.id },
    ...p,
  };
}

const f = (p: Partial<typeof FILTROS_VAZIOS>) => ({ ...FILTROS_VAZIOS, ...p });

describe("filtros", () => {
  const lista = [
    lead({ id: "a", nome: "DRA. JOANA - RECIFE", cidade: "RECIFE", whatsapp: "(81) 98888-1234" }),
    lead({ id: "b", nome: "Márcia", cidade: "Caruaru", whatsapp: null, etapa: "desqualificado", origem: null, criadoEm: "2025-12-31" }),
    lead({ id: "c", nome: "Paula", tarefas: 2, envios: 1, naoQuer: true, origem: "formulario" }),
  ];

  it("busca por nome sem acento, cidade e telefone", () => {
    expect(filtrarLeads(lista, f({ busca: "marcia" })).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarLeads(lista, f({ busca: "recife" })).map((l) => l.id)).toEqual(["a"]);
    expect(filtrarLeads(lista, f({ busca: "98888" })).map((l) => l.id)).toEqual(["a"]);
  });

  it("etapa, origem e sem origem", () => {
    expect(filtrarLeads(lista, f({ etapa: "desqualificado" })).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarLeads(lista, f({ origem: "formulario" })).map((l) => l.id)).toEqual(["c"]);
    expect(filtrarLeads(lista, f({ origem: "__sem__" })).map((l) => l.id)).toEqual(["b"]);
  });

  it("sem WhatsApp, sem atividade, não quer receber e criados antes de", () => {
    expect(filtrarLeads(lista, f({ semWhatsapp: true })).map((l) => l.id)).toEqual(["b"]);
    expect(filtrarLeads(lista, f({ semAtividade: true })).map((l) => l.id).sort()).toEqual(["a", "b"]);
    expect(filtrarLeads(lista, f({ naoQuer: true })).map((l) => l.id)).toEqual(["c"]);
    expect(filtrarLeads(lista, f({ criadosAntesDe: "2026-01-01" })).map((l) => l.id)).toEqual(["b"]);
  });

  it("lead sem data não entra no 'criados antes de'", () => {
    expect(filtrarLeads([lead({ id: "x", criadoEm: null })], f({ criadosAntesDe: "2030-01-01" }))).toEqual([]);
  });

  it("histórico = tarefa, anotação ou envio", () => {
    expect(temHistorico(lead({ id: "x" }))).toBe(false);
    expect(temHistorico(lead({ id: "x", anotacoes: 1 }))).toBe(true);
  });
});

describe("ordem", () => {
  const lista = [
    lead({ id: "1", nome: "Bia", criadoEm: "2026-03-01", cidade: "Recife" }),
    lead({ id: "2", nome: "Ana", criadoEm: null, cidade: null }),
    lead({ id: "3", nome: "Carla", criadoEm: "2026-01-01", cidade: "Arcoverde" }),
  ];
  it("nome, antigos (sem data no fim), recentes e cidade", () => {
    expect(ordenarLeads(lista, "nome").map((l) => l.id)).toEqual(["2", "1", "3"]);
    expect(ordenarLeads(lista, "antigos").map((l) => l.id)).toEqual(["3", "1", "2"]);
    expect(ordenarLeads(lista, "recentes").map((l) => l.id)).toEqual(["1", "3", "2"]);
    expect(ordenarLeads(lista, "cidade").map((l) => l.id)).toEqual(["3", "1", "2"]);
  });
});

describe("seleção", () => {
  it("limite de 200 por rodada", () => {
    expect(LIMITE_RODADA).toBe(200);
    const muitos = Array.from({ length: 250 }, (_, i) => ({ id: String(i) }));
    const r = marcarFiltrados(new Set(), muitos);
    expect(r.selecao.size).toBe(200);
    expect(r.cortados).toBe(50);
    expect(alternarSelecao(r.selecao, "249").recusado).toBe(true);
    expect(alternarSelecao(r.selecao, "0").selecao.size).toBe(199);
  });

  it("marcar todos não duplica nem perde quem já estava marcado", () => {
    const r = marcarFiltrados(new Set(["x"]), [{ id: "x" }, { id: "y" }], 3);
    expect([...r.selecao].sort()).toEqual(["x", "y"]);
    expect(r.cortados).toBe(0);
  });

  it("podar tira quem saiu da lista", () => {
    expect([...podarSelecao(new Set(["a", "b"]), [{ id: "b" }])]).toEqual(["b"]);
  });
});

describe("guardas da exclusão", () => {
  it("prévia com locação, lançamento, taxa ou evento barra", () => {
    expect(motivoParaNaoApagar({ locacoes: 0, lancamentos: 0, eventos: 0, taxas: 0 })).toBeNull();
    expect(motivoParaNaoApagar({ locacoes: 1 })).toMatch(/locação/);
    expect(motivoParaNaoApagar({ lancamentos: 2 })).toMatch(/lançamento/);
    expect(motivoParaNaoApagar({ taxas: 1 })).toMatch(/lançamento/);
    expect(motivoParaNaoApagar({ eventos: 1 })).toMatch(/agenda/);
    expect(motivoParaNaoApagar(null)).toMatch(/nada foi apagado/);
  });

  it("motivos de fora", () => {
    expect(motivosDeFora({ credito: true, login: true })).toEqual(["crédito", "acesso ao Planejador"]);
    expect(motivosDeFora({})).toEqual([]);
  });

  it("erro do banco aparece com o texto original", () => {
    expect(explicarErro({ message: "Apenas administradores ativos podem executar esta ação." })).toBe(
      "Apenas administradores ativos podem executar esta ação."
    );
    expect(explicarErro({ message: "violates foreign key", code: "23503" })).toMatch(/violates foreign key/);
  });
});

describe("resumo e cópia", () => {
  const lista = [lead({ id: "a", tarefas: 2, naoQuer: true, cadastro: { id: "a", name: "A", notes: "x" } }), lead({ id: "b", anotacoes: 3, envios: 1 })];

  it("resumo soma por lead e no total", () => {
    expect(resumoExclusao(lista)).toEqual({ total: 2, comTarefas: 1, comAnotacoes: 1, comEnvios: 1, naoQuer: 1, tarefas: 2, anotacoes: 3, envios: 1, indicaram: 0 });
  });

  it("cópia leva o cadastro inteiro e as contagens", () => {
    const agora = new Date("2026-10-25T15:04:05Z");
    const c = montarCopia(lista, agora);
    expect(c.total).toBe(2);
    expect(c.gerado_em).toBe("2026-10-25T15:04:05.000Z");
    expect(c.leads[0].cadastro).toEqual({ id: "a", name: "A", notes: "x" });
    expect(c.leads[0].contagens).toEqual({ tarefas: 2, anotacoes: 0, envios_campanha: 0, nao_quer_receber: true, indicou: 0 });
    expect(JSON.parse(textoCopia(lista, agora))).toEqual(c);
  });

  it("nome do arquivo no horário de Brasília", () => {
    expect(nomeArquivoCopia(new Date("2026-10-26T01:30:00Z"))).toBe("copia-leads-2026-10-25-223000.json");
  });

  it("data de criação vira o dia de Brasília", () => {
    expect(dataLocalDe("2026-10-26T01:30:00Z")).toBe("2026-10-25");
    expect(dataLocalDe(null)).toBeNull();
  });
});
