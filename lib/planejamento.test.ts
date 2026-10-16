import { describe, expect, it } from "vitest";
import {
  agruparPorCliente,
  dividirDisparos,
  estadoInicial,
  nomeProcedimento,
  profundidadeMaximaPapada,
  profundidadesPapada,
  retornosProximos,
  temConteudo,
  type PlanejamentoLinha,
} from "./planejamento";

const p = (x: Partial<PlanejamentoLinha>): PlanejamentoLinha => ({
  id: "1",
  client_id: "c1",
  calendar_event_id: null,
  paciente: null,
  data: "2026-10-10",
  data_retorno: null,
  procedimento: null,
  saldo_total: 0,
  total_disparos: 0,
  updated_at: "2026-10-10T10:00:00Z",
  cliente_nome: "Dra. Ana",
  ...x,
});

describe("planejamento", () => {
  it("estado inicial leva profissional e data", () => {
    expect(estadoInicial("Dra. Ana", "2026-10-20T00:00")).toEqual({ profissional: "Dra. Ana", data: "2026-10-20" });
    expect(estadoInicial()).toEqual({});
  });
  it("só guarda quando tem paciente, anotação ou disparos", () => {
    expect(temConteudo({ profissional: "Dra. Ana", data: "2026-10-20" })).toBe(false);
    expect(temConteudo({ paciente: " Maria " })).toBe(true);
    expect(temConteudo({}, 300)).toBe(true);
  });
  it("retornos dos próximos dias, do mais perto", () => {
    const r = retornosProximos(
      [p({ id: "a", data_retorno: "2026-10-30" }), p({ id: "b", data_retorno: "2026-10-17" }), p({ id: "c", data_retorno: "2026-10-01" })],
      "2026-10-16"
    );
    expect(r.map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("agrupa por cliente, sem cliente por último", () => {
    const g = agruparPorCliente([
      p({ id: "1", client_id: null, cliente_nome: null, data: "2026-10-15" }),
      p({ id: "2", client_id: "c1", data: "2026-10-01" }),
      p({ id: "3", client_id: "c1", data: "2026-10-12" }),
    ]);
    expect(g.map((x) => x.nome)).toEqual(["Dra. Ana", "Sem cliente"]);
    expect(g[0].itens.map((x) => x.id)).toEqual(["3", "2"]);
  });
});

describe("nome do procedimento pela escolha de áreas", () => {
  const rosto = ["frontal", "temporal", "terco_medio", "nasolabial", "jowls", "arcomandibular"];
  it("rosto inteiro (sem as pequenas) é Full Face", () => {
    expect(nomeProcedimento(rosto)).toBe("Full Face");
    expect(nomeProcedimento([...rosto, "perioral_sup", "mento"])).toBe("Full Face");
  });
  it("o que é de fora do rosto soma no nome, na ordem", () => {
    expect(nomeProcedimento([...rosto, "papada"])).toBe("Full Face + Papada");
    expect(nomeProcedimento([...rosto, "pescoco", "papada"])).toBe("Full Face + Papada + Pescoço");
  });
  it("sem o rosto completo, lista as áreas", () => {
    expect(nomeProcedimento(["papada", "jowls"])).toBe("Jowls + Papada");
  });
});

describe("papada pelo adipômetro", () => {
  it("exemplo do dono: 20 mm, 3 profundidades, 1.500 disparos", () => {
    expect(profundidadesPapada(20, 3)).toEqual([10, 7, 4.5]);
    expect(dividirDisparos(1500, 3)).toEqual([500, 500, 500]);
  });
  it("mais funda é a metade do adipômetro, até 13 mm, e no mínimo 4,5", () => {
    expect(profundidadeMaximaPapada(30)).toBe(13);
    expect(profundidadeMaximaPapada(15)).toBe(7);
    expect(profundidadeMaximaPapada(6)).toBe(4.5);
  });
  it("no máximo 5 profundidades, sempre com 4,5 e a mais funda", () => {
    const p = profundidadesPapada(20, 8);
    expect(p.length).toBe(5);
    expect(p[0]).toBe(10);
    expect(p[p.length - 1]).toBe(4.5);
  });
  it("não inventa profundidade quando não cabe", () => {
    expect(profundidadesPapada(9, 3)).toEqual([4.5]);
    expect(profundidadesPapada(12, 3)).toEqual([6, 4.5]);
  });
  it("sobra da divisão vai para a mais funda", () => {
    expect(dividirDisparos(1000, 3)).toEqual([340, 330, 330]);
  });
});
