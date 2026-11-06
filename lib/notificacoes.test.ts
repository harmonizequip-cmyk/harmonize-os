import { describe, expect, it } from "vitest";
import { agruparPorDia, diaDeBrasilia, enderecoInterno, rotuloDia, textoSelo } from "./notificacoes";

describe("notificações", () => {
  it("dia de Brasília vira o dia certo depois das 21h", () => {
    expect(diaDeBrasilia("2026-11-06T01:30:00Z")).toBe("2026-11-05");
  });
  it("agrupa por dia, mais recente primeiro", () => {
    const g = agruparPorDia([
      { id: "a", criada_em: "2026-11-04T12:00:00Z" },
      { id: "b", criada_em: "2026-11-05T15:00:00Z" },
      { id: "c", criada_em: "2026-11-05T10:00:00Z" },
    ]);
    expect(g.map((x) => [x.dia, x.itens.map((i) => i.id)])).toEqual([
      ["2026-11-05", ["b", "c"]],
      ["2026-11-04", ["a"]],
    ]);
  });
  it("rótulo do dia", () => {
    expect(rotuloDia("2026-11-06", "2026-11-06", "2026-11-05")).toBe("Hoje");
    expect(rotuloDia("2026-11-05", "2026-11-06", "2026-11-05")).toBe("Ontem");
    expect(rotuloDia("2026-11-01", "2026-11-06", "2026-11-05")).toBe("01/11");
  });
  it("selo do sino", () => {
    expect(textoSelo(0)).toBeNull();
    expect(textoSelo(7)).toBe("7");
    expect(textoSelo(120)).toBe("99+");
  });
  it("só abre endereço do próprio app", () => {
    expect(enderecoInterno("/agenda?x=1")).toBe("/agenda?x=1");
    expect(enderecoInterno("//mal.com")).toBeNull();
    expect(enderecoInterno("https://mal.com")).toBeNull();
    expect(enderecoInterno(null)).toBeNull();
  });
});
