import { describe, expect, it } from "vitest";
import { agruparPorCliente, estadoInicial, retornosProximos, temConteudo, type PlanejamentoLinha } from "./planejamento";

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
