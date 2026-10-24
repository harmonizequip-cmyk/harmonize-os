import { describe, expect, it } from "vitest";
import { linkDaMovimentacao, linkLocacao, linkNovoPlanejamento } from "./atalhos";

describe("atalhos", () => {
  it("locação abre dentro da ficha da cliente", () => {
    expect(linkLocacao("c1", "r1")).toBe("/clientes/c1?locacao=r1");
  });
  it("novo planejamento leva cliente e atendimento quando houver", () => {
    expect(linkNovoPlanejamento("c1", "e1")).toBe("/planejador/novo?cliente=c1&evento=e1");
    expect(linkNovoPlanejamento()).toBe("/planejador/novo");
  });
  it("movimentação leva ao item certo pela entidade", () => {
    expect(linkDaMovimentacao("transactions", "t1")).toBe("/financeiro?lancamento=t1");
    expect(linkDaMovimentacao("calendar_events", "e1")).toBe("/agenda?evento=e1");
    expect(linkDaMovimentacao("categories", "c1")).toBe("/configuracoes?secao=categorias");
    expect(linkDaMovimentacao("contas_pix", "p1")).toBe("/configuracoes?secao=contasPix");
    expect(linkDaMovimentacao("cidades_coordenadas", "x1")).toBe("/configuracoes?secao=cidades");
    expect(linkDaMovimentacao("rentals", "r1", { client_id: "c1" })).toBe("/clientes/c1?locacao=r1");
    expect(linkDaMovimentacao("rentals", "r1")).toBeNull();
    expect(linkDaMovimentacao("equipments", "x")).toBe("/equipamentos");
    expect(linkDaMovimentacao("mentoring_events", "x")).toBeNull();
    expect(linkDaMovimentacao("clients", null)).toBeNull();
  });
});
