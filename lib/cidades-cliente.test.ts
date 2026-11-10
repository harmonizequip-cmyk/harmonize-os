import { describe, expect, it } from "vitest";
import { adicionarCidadeExtra, cidadesDaCliente, sugerirCidades, ufPeloWhatsapp } from "./cidades-cliente";

describe("cidades da cliente", () => {
  it("principal primeiro, sem repetir", () => {
    expect(cidadesDaCliente("JOÃO PESSOA", ["Campina Grande", "joao pessoa", " ", null])).toEqual(["JOÃO PESSOA", "Campina Grande"]);
    expect(cidadesDaCliente(null, ["RECIFE"])).toEqual(["RECIFE"]);
  });
  it("adiciona extra em maiúsculas e sem repetir", () => {
    expect(adicionarCidadeExtra("JOÃO PESSOA", [], " campina  grande ")).toEqual(["CAMPINA GRANDE"]);
    expect(adicionarCidadeExtra("JOÃO PESSOA", ["CAMPINA GRANDE"], "Joao Pessoa")).toEqual(["CAMPINA GRANDE"]);
    expect(adicionarCidadeExtra(null, [], "  ")).toEqual([]);
  });
  it("estado pelo DDD", () => {
    expect(ufPeloWhatsapp("5583999998888")).toBe("PB");
    expect(ufPeloWhatsapp("(81) 98888-7777")).toBe("PE");
    expect(ufPeloWhatsapp("11 3333-4444")).toBe("SP");
    expect(ufPeloWhatsapp("1234")).toBeNull();
  });
  it("sugere cidades, do estado provável primeiro", () => {
    const lista = [
      { nome: "Campina Grande", uf: "PB" },
      { nome: "Campinas", uf: "SP" },
      { nome: "Recife", uf: "PE" },
    ];
    expect(sugerirCidades("camp", lista, "SP").map((c) => c.nome)).toEqual(["Campinas", "Campina Grande"]);
    expect(sugerirCidades("", lista)).toEqual([]);
  });
});
