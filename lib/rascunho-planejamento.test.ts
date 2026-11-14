import { describe, expect, it } from "vitest";
import { chaveRascunho, decidirRascunho, impressao, lerRascunho, PREFIXO_RASCUNHO, proximaEspera, rascunhosOrfaos, VALIDADE_RASCUNHO_MS, type Rascunho } from "./rascunho-planejamento";
import { normalizarPlano, paraEstado } from "./planejador";
import type { EstadoPlanejador } from "./planejamento";

const AGORA = Date.parse("2026-10-31T15:00:00Z");

function comDisparos(n: number, extra: EstadoPlanejador = {}): EstadoPlanejador {
  const p = normalizarPlano({ data: "2026-10-31", saldoTotal: "10000", ...extra });
  const linhas = p.DATA.frontal.map((l, i) => (i === 0 ? { ...l, dispD: n, dispE: n } : l));
  return paraEstado({ ...p, DATA: { ...p.DATA, frontal: linhas } });
}

function rascunho(estado: EstadoPlanejador, r: Partial<Rascunho> = {}): Rascunho {
  return { v: 1, estado, cliente: "", evento: "", versao: 3, em: AGORA - 60000, base: null, ...r };
}

describe("chaveRascunho", () => {
  it("usa o id do plano salvo", () => {
    expect(chaveRascunho("abc", "c1", "e1")).toBe("harmonize-planejamento-rascunho-abc");
  });
  it("plano novo usa cliente e atendimento", () => {
    expect(chaveRascunho(null, "c1", "e1")).toBe("harmonize-planejamento-rascunho-novo-c1-e1");
    expect(chaveRascunho(null, null, null)).toBe("harmonize-planejamento-rascunho-novo-sem-sem");
  });
});

describe("impressao", () => {
  it("ignora ordem das chaves, paciente e pacienteId", () => {
    const a = comDisparos(200, { paciente: "maria  silva" });
    const b = { ...comDisparos(200), paciente: "MARIA SILVA", pacienteId: "x" };
    expect(impressao(a)).toBe(impressao(b));
  });
  it("muda quando muda um disparo", () => {
    expect(impressao(comDisparos(200))).not.toBe(impressao(comDisparos(250)));
  });
});

describe("lerRascunho", () => {
  it("lê o que foi gravado", () => {
    const r = rascunho(comDisparos(100), { base: "b" });
    expect(lerRascunho(JSON.stringify(r))).toEqual(r);
  });
  it("texto estranho vira null", () => {
    expect(lerRascunho(null)).toBeNull();
    expect(lerRascunho("{")).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 2, estado: {}, em: 1 }))).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 1, estado: [], em: 1 }))).toBeNull();
    expect(lerRascunho(JSON.stringify({ v: 1, estado: {} }))).toBeNull();
  });
});

describe("decidirRascunho em plano salvo", () => {
  const servidor = comDisparos(100);
  const base = impressao(servidor);

  it("sem rascunho, nada", () => {
    expect(decidirRascunho({ rascunho: null, novo: false, servidorEstado: servidor, agora: AGORA })).toBe("nada");
  });
  it("feito em cima da versão do banco: restaura, mesmo com relógio do celular atrasado", () => {
    const r = rascunho(comDisparos(300), { base, em: AGORA - 3600000 });
    expect(decidirRascunho({ rascunho: r, novo: false, servidorEstado: servidor, servidorUpdatedAt: new Date(AGORA).toISOString(), agora: AGORA })).toBe("restaurar");
  });
  it("igual ao banco: descarta", () => {
    const r = rascunho(comDisparos(100), { base: "outra" });
    expect(decidirRascunho({ rascunho: r, novo: false, servidorEstado: servidor, agora: AGORA })).toBe("descartar");
  });
  it("banco mudou depois do rascunho (outro aparelho): descarta", () => {
    const r = rascunho(comDisparos(300), { base: "antiga", em: AGORA - 600000 });
    expect(decidirRascunho({ rascunho: r, novo: false, servidorEstado: servidor, servidorUpdatedAt: new Date(AGORA - 60000).toISOString(), agora: AGORA })).toBe("descartar");
  });
  it("base desconhecida e rascunho mais novo que o updated_at: restaura", () => {
    const r = rascunho(comDisparos(300), { base: null, em: AGORA - 1000 });
    expect(decidirRascunho({ rascunho: r, novo: false, servidorEstado: servidor, servidorUpdatedAt: new Date(AGORA - 60000).toISOString(), agora: AGORA })).toBe("restaurar");
  });
  it("base desconhecida e sem updated_at: restaura (melhor não perder)", () => {
    const r = rascunho(comDisparos(300));
    expect(decidirRascunho({ rascunho: r, novo: false, servidorEstado: servidor, agora: AGORA })).toBe("restaurar");
  });
  it("rascunho velho demais: descarta", () => {
    const r = rascunho(comDisparos(300), { base, em: AGORA - VALIDADE_RASCUNHO_MS - 1 });
    expect(decidirRascunho({ rascunho: r, novo: false, servidorEstado: servidor, agora: AGORA })).toBe("descartar");
  });
});

describe("decidirRascunho em plano novo", () => {
  it("com conteúdo, pergunta", () => {
    expect(decidirRascunho({ rascunho: rascunho(comDisparos(100)), novo: true, agora: AGORA })).toBe("perguntar");
    expect(decidirRascunho({ rascunho: rascunho({ paciente: "Ana" }), novo: true, agora: AGORA })).toBe("perguntar");
  });
  it("vazio, descarta", () => {
    expect(decidirRascunho({ rascunho: rascunho({ profissional: "Dra. X", data: "2026-10-31" }), novo: true, agora: AGORA })).toBe("descartar");
  });
});

describe("proximaEspera", () => {
  it("cresce e para em 30 s", () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(proximaEspera)).toEqual([2000, 5000, 10000, 20000, 30000, 30000, 30000]);
  });
});

describe("rascunhosOrfaos", () => {
  const agora = Date.UTC(2026, 10, 14, 13);
  const comDisparos = {
    v: 1,
    estado: { paciente: "ALTAMIR", DATA: { pescoco: [{ prof: "4.5", dispD: 500, dispE: 500 }] } },
    cliente: "c1",
    evento: "",
    versao: 3,
    em: agora - 3600000,
    base: null,
  };
  const vazio = { ...comDisparos, estado: { paciente: "SEM DISPAROS", DATA: {} } };
  it("acha só o rascunho de plano apagado que tem disparos", () => {
    const r = rascunhosOrfaos(
      [
        { chave: PREFIXO_RASCUNHO + "apagado", texto: JSON.stringify(comDisparos) },
        { chave: PREFIXO_RASCUNHO + "existe", texto: JSON.stringify(comDisparos) },
        { chave: PREFIXO_RASCUNHO + "vazio", texto: JSON.stringify(vazio) },
        { chave: PREFIXO_RASCUNHO + "novo-c1-sem", texto: JSON.stringify(comDisparos) },
        { chave: "outra-coisa", texto: JSON.stringify(comDisparos) },
      ],
      new Set(["existe"]),
      agora
    );
    expect(r.map((x) => x.id)).toEqual(["apagado"]);
    expect(r[0].total).toBe(1000);
    expect(r[0].paciente).toBe("ALTAMIR");
  });
  it("ignora rascunho velho demais", () => {
    const velho = { ...comDisparos, em: agora - 40 * 86400000 };
    expect(rascunhosOrfaos([{ chave: PREFIXO_RASCUNHO + "x", texto: JSON.stringify(velho) }], new Set(), agora)).toEqual([]);
  });
});
