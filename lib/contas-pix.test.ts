import { describe, expect, it } from "vitest";
import { CONTAS_PIX_PADRAO, chaveFormatada, codigoPadrao, contaPorCodigo, contasParaEscolha, problemaContaPix, type ContaPix } from "./contas-pix";
import { PIX_CONTAS } from "./rental-calculator";

const nova: ContaPix = { codigo: "nubank", rotulo: "Nubank", titular: "Fulano", tipo_chave: "telefone", chave: "+5583999990000", ordem: 0, ativa: true, padrao: true };

describe("contas PIX", () => {
  it("as de sempre continuam iguais (reserva e formato antigo)", () => {
    expect(PIX_CONTAS).toEqual([
      { value: "eder", nome: "Eder Campos de Almeida", chave: "07442790623" },
      { value: "harmonize", nome: "Harmonize Bella Prime LTDA", chave: "harmonizequip@gmail.com" },
      { value: "laser_dream", nome: "Laser Dream Campina Grande LTDA", chave: "ed21011f-1880-4293-9cb3-cdc087ac80de" },
    ]);
    expect(codigoPadrao(null)).toBe("harmonize");
  });

  it("escolha: só ativas (mais a do pagamento), na ordem; padrão vem marcada", () => {
    const lista = [...CONTAS_PIX_PADRAO.map((c) => ({ ...c, padrao: false })), nova, { ...nova, codigo: "velha", rotulo: "Velha", ativa: false, padrao: false, ordem: 9 }];
    expect(contasParaEscolha(lista).map((c) => c.codigo)).toEqual(["nubank", "eder", "harmonize", "laser_dream"]);
    expect(contasParaEscolha(lista, "velha").map((c) => c.codigo)).toContain("velha");
    expect(codigoPadrao(lista)).toBe("nubank");
    expect(codigoPadrao([{ ...nova, padrao: false }])).toBe("nubank");
    expect(contasParaEscolha([])).toHaveLength(3);
  });

  it("acha a conta pelo código, com as de sempre como reserva", () => {
    expect(contaPorCodigo([nova], "nubank")?.titular).toBe("Fulano");
    expect(contaPorCodigo([nova], "eder")?.titular).toBe("Eder Campos de Almeida");
    expect(contaPorCodigo(null, "")).toBeNull();
  });

  it("formata e confere a chave", () => {
    expect(chaveFormatada({ tipo_chave: "cpf", chave: "07442790623" })).toBe("074.427.906-23");
    expect(chaveFormatada({ tipo_chave: "cnpj", chave: "12345678000190" })).toBe("12.345.678/0001-90");
    expect(chaveFormatada({ tipo_chave: "email", chave: "a@b.co" })).toBe("a@b.co");
    const base = { rotulo: "X", titular: "Y", tipo_chave: "cpf", chave: "074.427.906-23", ativa: true, padrao: false };
    expect(problemaContaPix(base)).toBeNull();
    expect(problemaContaPix({ ...base, chave: "123" })).toMatch(/CPF/);
    expect(problemaContaPix({ ...base, tipo_chave: "email", chave: "sem-arroba" })).toMatch(/E-mail/);
    expect(problemaContaPix({ ...base, padrao: true, ativa: false })).toMatch(/padrão/);
    expect(problemaContaPix({ ...base, titular: " " })).toMatch(/titular/);
  });
});
