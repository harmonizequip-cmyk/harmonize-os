import { describe, it, expect } from "vitest";
import { agruparPorFatura, linkFatura } from "./lancamentos-fatura";

const l = (id: string, amount: number, extra: Record<string, unknown> = {}) => ({ id, amount, ...extra });

describe("agruparPorFatura", () => {
  it("junta as compras da mesma fatura numa linha, no lugar da primeira", () => {
    const r = agruparPorFatura([
      l("a", 10),
      l("b", 20.1, { cartao_mov: "compra", cartao_id: "c1", fatura_ref: "2026-11" }),
      l("c", 5),
      l("d", 30.2, { cartao_mov: "compra", cartao_id: "c1", fatura_ref: "2026-11" }),
      l("e", 7, { cartao_mov: "compra", cartao_id: "c2", fatura_ref: "2026-11" }),
    ]);
    expect(r.map((x) => (x.tipo === "fatura" ? x.chave : x.item.id))).toEqual(["a", "c1|2026-11", "c", "c2|2026-11"]);
    const g = r[1];
    expect(g.tipo === "fatura" && g.total).toBe(50.3);
    expect(g.tipo === "fatura" && g.itens.map((i) => i.id)).toEqual(["b", "d"]);
  });

  it("pagamento de fatura e lançamento comum ficam soltos", () => {
    const r = agruparPorFatura([l("p", 100, { cartao_mov: "pagamento", cartao_id: "c1", fatura_ref: "2026-11" }), l("x", 1)]);
    expect(r.every((x) => x.tipo === "lancamento")).toBe(true);
  });

  it("link abre a fatura certa em cada espaço", () => {
    expect(linkFatura("pessoal", "c1", "2026-11")).toBe("/pessoal/cartoes?cartao=c1&fatura=2026-11");
    expect(linkFatura("harmonize", "c1", "2026-11")).toBe("/financeiro/cartoes?cartao=c1&fatura=2026-11");
  });
});
