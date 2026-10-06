import { describe, it, expect } from "vitest";
import { ehSoTelefone, filtrarParaEscolha, ordenarParaEscolha } from "./busca-cliente";

const lista = [
  { id: "1", name: "+55 81 9411-3482" },
  { id: "2", name: "DRA. ÉLIS ESSA" },
  { id: "3", name: "DRA. ANA PAULA", whatsapp: "83 99999-1234", city: "João Pessoa" },
  { id: "4", name: "+55 83 8116-0790" },
];

describe("busca de cliente", () => {
  it("telefone vai para o fim, nomes em ordem", () => {
    expect(ordenarParaEscolha(lista).map((c) => c.id)).toEqual(["3", "2", "1", "4"]);
  });

  it("acha sem acento, por cidade e por parte do telefone", () => {
    expect(filtrarParaEscolha(lista, "elis").map((c) => c.id)).toEqual(["2"]);
    expect(filtrarParaEscolha(lista, "joao pessoa").map((c) => c.id)).toEqual(["3"]);
    expect(filtrarParaEscolha(lista, "1234").map((c) => c.id)).toEqual(["3"]);
    expect(filtrarParaEscolha(lista, "8116").map((c) => c.id)).toEqual(["4"]);
  });

  it("reconhece cadastro que é só telefone", () => {
    expect(ehSoTelefone("+55 83 8116-0790")).toBe(true);
    expect(ehSoTelefone("DRA. ANA")).toBe(false);
  });
});
