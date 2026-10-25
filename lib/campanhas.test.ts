import { describe, expect, it } from "vitest";
import {
  EXEMPLO_BLACK_FRIDAY,
  FILTROS_PADRAO,
  alternarExcluido,
  candidatosDaCampanha,
  cidadeParaMensagem,
  contarPorStatus,
  enviadosNoDia,
  filaDaCampanha,
  lerFiltros,
  limiteValido,
  limparExcluidos,
  mensagemParaPessoa,
  previaDaMensagem,
  problemasDaMensagem,
  renderizarComValores,
  situacaoDoLimite,
  temWhatsApp,
  totalRecebidos,
  type FiltrosCampanha,
} from "./campanhas";
import type { PessoaClassificada } from "./relacionamento";

function pessoa(id: string, extra: Partial<PessoaClassificada> = {}): PessoaClassificada {
  return {
    id, nome: `DRA. ${id.toUpperCase()} - RECIFE`, treatment: null, displayName: null, whatsapp: "83999990000", cidade: "RECIFE",
    stage: "cliente", ehCliente: true, parceiro: false, criadoEm: "2026-01-01", locacoes: [],
    proximaReserva: null, ultimoContato: null, deve: 0, tarefasPendentes: 0,
    classe: "ativa", valor: "comum", totalFaturado: 0, ultimaLocacao: null, ritmo: null,
    diasSemLocar: null, diasSemContato: 0, cadencia: 21, devida: false, motivo: null, prioridade: 0,
    ...extra,
  };
}

const vazio = { jaNaCampanha: new Set<string>(), naoQuer: new Set<string>() };
const f = (x: Partial<FiltrosCampanha> = {}): FiltrosCampanha => ({ ...FILTROS_PADRAO, ...x });

describe("filtros", () => {
  it("lê o jsonb com padrões e descarta o que não serve", () => {
    expect(lerFiltros(null)).toEqual(FILTROS_PADRAO);
    expect(lerFiltros({ tipo: "xpto", classes: ["ativa", "inventada", "ativa"], soHoraDeChamar: "sim", excluidos: ["a", "", 3, "a"] })).toEqual({
      ...FILTROS_PADRAO,
      classes: ["ativa"],
      excluidos: ["a"],
    });
    expect(lerFiltros({ tipo: "leads", excluirComReserva: false }).excluirComReserva).toBe(false);
  });

  it("limite diário fica entre 1 e 100", () => {
    expect(limiteValido(0)).toBe(1);
    expect(limiteValido(250)).toBe(100);
    expect(limiteValido("abc")).toBe(15);
    expect(limiteValido(20.4)).toBe(20);
  });

  it("WhatsApp precisa de DDD e número", () => {
    expect(temWhatsApp("(83) 99999-0000")).toBe(true);
    expect(temWhatsApp("99999-000")).toBe(false);
    expect(temWhatsApp(null)).toBe(false);
  });
});

describe("público", () => {
  const pessoas = [
    pessoa("a", { classe: "ativa", prioridade: 10, devida: true }),
    pessoa("b", { classe: "em_risco", prioridade: 50, devida: true }),
    pessoa("c", { classe: "quente", ehCliente: false, stage: "qualificado", prioridade: 70, devida: true }),
    pessoa("d", { classe: "fria", ehCliente: false, stage: "lead", prioridade: 0 }),
    pessoa("e", { classe: "agendada", proximaReserva: "2026-11-20" }),
    pessoa("f", { whatsapp: null }),
    pessoa("g", { stage: "desqualificado" }),
  ];

  it("sempre tira sem WhatsApp, desqualificado, quem já está nesta campanha e quem não quer", () => {
    const ids = candidatosDaCampanha(pessoas, f({ excluirComReserva: false }), {
      jaNaCampanha: new Set(["a"]),
      naoQuer: new Set(["d"]),
    }).map((p) => p.id);
    expect(ids).not.toContain("f");
    expect(ids).not.toContain("g");
    expect(ids).not.toContain("a");
    expect(ids).not.toContain("d");
    expect(ids).toContain("e");
  });

  it("ordena pela prioridade do Relacionamento e depois pelo nome", () => {
    expect(candidatosDaCampanha(pessoas, f(), vazio).map((p) => p.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("filtra por tipo, classes e hora de chamar", () => {
    expect(candidatosDaCampanha(pessoas, f({ tipo: "clientes" }), vazio).map((p) => p.id)).toEqual(["b", "a"]);
    expect(candidatosDaCampanha(pessoas, f({ tipo: "leads" }), vazio).map((p) => p.id)).toEqual(["c", "d"]);
    expect(candidatosDaCampanha(pessoas, f({ classes: ["em_risco", "fria"] }), vazio).map((p) => p.id)).toEqual(["b", "d"]);
    // classe de lead escolhida com tipo clientes é ignorada (volta a todas de cliente)
    expect(candidatosDaCampanha(pessoas, f({ tipo: "clientes", classes: ["fria"] }), vazio).map((p) => p.id)).toEqual(["b", "a"]);
    expect(candidatosDaCampanha(pessoas, f({ soHoraDeChamar: true }), vazio).map((p) => p.id)).toEqual(["c", "b", "a"]);
  });

  it("reserva futura sai por padrão e entra quando o filtro é desligado", () => {
    expect(candidatosDaCampanha(pessoas, f(), vazio).map((p) => p.id)).not.toContain("e");
    expect(candidatosDaCampanha(pessoas, f({ excluirComReserva: false }), vazio).map((p) => p.id)).toContain("e");
  });

  it("só quem nunca alugou: ligado filtra, desligado e filtros antigos não mudam nada", () => {
    const com = [
      pessoa("n1", { ultimaLocacao: null, prioridade: 5 }),
      pessoa("n2", { ultimaLocacao: "2026-09-01", prioridade: 4 }),
      pessoa("n3", { ultimaLocacao: null, classe: "fria", ehCliente: false, stage: "lead", prioridade: 3 }),
    ];
    expect(candidatosDaCampanha(com, f({ soNuncaAlugou: true }), vazio).map((p) => p.id)).toEqual(["n1", "n3"]);
    expect(candidatosDaCampanha(com, f({ soNuncaAlugou: false }), vazio).map((p) => p.id)).toEqual(["n1", "n2", "n3"]);
    const antigo = lerFiltros({ tipo: "ambos", classes: [], excluirComReserva: true });
    expect(antigo.soNuncaAlugou).toBe(false);
    expect(candidatosDaCampanha(com, antigo, vazio).map((p) => p.id)).toEqual(["n1", "n2", "n3"]);
    expect(lerFiltros({ soNuncaAlugou: "sim" }).soNuncaAlugou).toBe(false);
    expect(lerFiltros({ soNuncaAlugou: true }).soNuncaAlugou).toBe(true);
  });

  it("caixinha desmarcada tira da fila e volta ao marcar", () => {
    const cand = candidatosDaCampanha(pessoas, f(), vazio);
    let filtros = alternarExcluido(f(), "b");
    expect(filaDaCampanha(cand, filtros).map((p) => p.id)).toEqual(["c", "a", "d"]);
    filtros = alternarExcluido(filtros, "b");
    expect(filaDaCampanha(cand, filtros).map((p) => p.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("guarda só os tirados à mão que ainda são candidatos", () => {
    const cand = candidatosDaCampanha(pessoas, f(), vazio);
    expect(limparExcluidos(f({ excluidos: ["b", "zzz"] }), cand).excluidos).toEqual(["b"]);
  });
});

describe("mensagem", () => {
  it("aceita só {saudacao}, {nome} e {cidade}", () => {
    expect(problemasDaMensagem(EXEMPLO_BLACK_FRIDAY)).toEqual([]);
    expect(problemasDaMensagem("{saudacao} {nome} de {cidade}")).toEqual([]);
    expect(problemasDaMensagem("Oi {data}")[0]).toContain("{data} não existe");
    expect(problemasDaMensagem("Oi {nome")).toEqual(["Tem chave sem par: toda variável é {nome}, com as duas chaves."]);
    expect(problemasDaMensagem("Oi nome}")).toHaveLength(1);
    expect(problemasDaMensagem("Oi {}")).toEqual(["Tem chave vazia: {}."]);
    expect(problemasDaMensagem("   ")).toEqual(["Escreva a mensagem."]);
    expect(problemasDaMensagem("x".repeat(2001))[0]).toContain("Passou de");
  });

  it("monta com saudação curta, nome e cidade da pessoa", () => {
    const p = { nome: "DRA. SIMONE KARLA - BOM JARDIM - PE", treatment: null, displayName: null, cidade: "BOM JARDIM" };
    expect(mensagemParaPessoa("{saudacao} Vamos a {cidade}, {nome}?", p)).toBe("Olá, Dra. Simone! Vamos a Bom Jardim, Dra. Simone?");
    expect(mensagemParaPessoa(EXEMPLO_BLACK_FRIDAY, p).startsWith("Olá, Dra. Simone! Estamos antecipando")).toBe(true);
  });

  it("variável sem valor some sem espaço duplo", () => {
    expect(renderizarComValores("Atendo em {cidade} amanhã", { cidade: "" })).toBe("Atendo em amanhã");
    expect(renderizarComValores("Oi {nome}!", {})).toBe("Oi!");
    const sem = mensagemParaPessoa("{saudacao} Em {cidade}.", { nome: "123", treatment: null, displayName: null, cidade: null });
    expect(sem).toBe("Olá! Em.");
  });

  it("prévia usa os dados de exemplo", () => {
    expect(previaDaMensagem("{saudacao} {cidade}")).toBe("Olá, Dra. Simone! Caruaru");
  });

  it("cidade em caixa alta vira nome próprio", () => {
    expect(cidadeParaMensagem("CAMPINA GRANDE")).toBe("Campina Grande");
    expect(cidadeParaMensagem("VITÓRIA DE SANTO ANTÃO")).toBe("Vitória de Santo Antão");
    expect(cidadeParaMensagem("João Pessoa")).toBe("João Pessoa");
    expect(cidadeParaMensagem(null)).toBe("");
  });
});

describe("limite diário", () => {
  it("conta pelo dia de Brasília, não pelo UTC", () => {
    // 25/10 22h em Brasília = 26/10 01h UTC: ainda é dia 25.
    const envios = [
      { enviado_em: "2026-10-26T01:00:00Z" },
      { enviado_em: "2026-10-25T12:00:00Z" },
      { enviado_em: "2026-10-26T04:00:00Z" }, // 26/10 01h em Brasília
      { enviado_em: null },
    ];
    expect(enviadosNoDia(envios, "2026-10-25")).toBe(2);
    expect(enviadosNoDia(envios, "2026-10-26")).toBe(1);
  });

  it("vagas e limite atingido", () => {
    expect(situacaoDoLimite(3, 15)).toEqual({ enviados: 3, limite: 15, vagas: 12, atingido: false });
    expect(situacaoDoLimite(15, 15).atingido).toBe(true);
    expect(situacaoDoLimite(18, 15).vagas).toBe(0);
  });

  it("conta por situação e quem recebeu", () => {
    const envios = [
      { status: "enviado" as const, enviado_em: "2026-10-25T12:00:00Z" },
      { status: "respondeu" as const, enviado_em: "2026-10-25T12:00:00Z" },
      { status: "pulado" as const, enviado_em: null },
      { status: "nao_quer" as const, enviado_em: null },
    ];
    expect(contarPorStatus(envios)).toEqual({ enviado: 1, respondeu: 1, agendou: 0, nao_quer: 1, pulado: 1 });
    expect(totalRecebidos(envios)).toBe(2);
  });
});
