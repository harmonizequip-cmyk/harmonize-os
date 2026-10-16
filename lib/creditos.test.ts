import { describe, expect, it } from "vitest";
import { creditoUsavel, disparosCobrados, resumoCredito, somarContagens, temCredito } from "./creditos";
import { foraDoSaldo } from "./cartao";

describe("créditos da cliente", () => {
  it("soma as contagens e separa o que vira crédito", () => {
    const r = somarContagens([
      { inicial: 1200000, final: 1203500, gera_credito: true },
      { inicial: 52000, final: 50000 },
    ]);
    expect(r).toEqual({ total: 5500, credito: 3500 });
  });
  it("só somar não gera crédito", () => {
    expect(somarContagens([{ inicial: 0, final: 10000 }, { inicial: 100, final: 2100 }])).toEqual({ total: 12000, credito: 0 });
  });
  it("crédito usado tira disparos antes do cálculo, sem passar dos feitos", () => {
    expect(creditoUsavel(4000, 3500)).toBe(3500);
    expect(creditoUsavel(2000, 3500)).toBe(2000);
    expect(disparosCobrados(4000, 3500)).toBe(500);
    expect(disparosCobrados(2000, 3500)).toBe(0);
  });
  it("resumo e selo", () => {
    expect(temCredito({ disparos_disponiveis: 0, disparos_aguardando: 0, valor_disponivel: 0 })).toBe(false);
    expect(temCredito({ disparos_disponiveis: 0, disparos_aguardando: 3500, valor_disponivel: 0 })).toBe(true);
    expect(resumoCredito({ disparos_disponiveis: 3500, disparos_aguardando: 0, valor_disponivel: 100 })).toBe("3.500 disparos · R$ 100,00");
  });
  it("permuta e compra no cartão ficam fora do saldo", () => {
    expect(foraDoSaldo({ payment_method: "permuta" })).toBe(true);
    expect(foraDoSaldo({ cartao_mov: "compra" })).toBe(true);
    expect(foraDoSaldo({ payment_method: "pix" })).toBe(false);
  });
});
