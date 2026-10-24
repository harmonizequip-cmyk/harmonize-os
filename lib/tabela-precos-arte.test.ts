import { describe, expect, it } from "vitest";
import { reaisTabela } from "./tabela-precos-arte";

describe("reaisTabela", () => {
  it("formata com 2 casas, ou 3 quando precisa", () => {
    expect(reaisTabela(2500)).toBe("R$ 2.500,00");
    expect(reaisTabela(0.1)).toBe("R$ 0,10");
    expect(reaisTabela(0.07)).toBe("R$ 0,07");
    expect(reaisTabela(0.065)).toBe("R$ 0,065");
  });
});

import { ESTIMATIVAS_DISPAROS, estimativasDaArte } from "./tabela-precos-arte";
import { DEFAULT_PREFERENCIAS } from "./preferencias";

describe("estimativasDaArte", () => {
  it("padrão: as 6 de sempre na grade e o combo em destaque", () => {
    const e = estimativasDaArte();
    expect(e.itens).toEqual(ESTIMATIVAS_DISPAROS.slice(0, 6));
    expect(e.destaque).toEqual(ESTIMATIVAS_DISPAROS[6]);
    expect(e.destaque).toEqual({ procedimento: "Full face + pescoço + papada", disparos: 16000 });
  });

  it("destaque sem nome some; grade com no máximo 6", () => {
    const tp = {
      ...DEFAULT_PREFERENCIAS.tabelaPrecos,
      estimativas: Array.from({ length: 8 }, (_, i) => ({ procedimento: `P${i}`, disparos: 100 })),
      destaque: { procedimento: "", disparos: 0 },
    };
    const e = estimativasDaArte(tp);
    expect(e.itens).toHaveLength(6);
    expect(e.destaque).toBeNull();
  });
});
