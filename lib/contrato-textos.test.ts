import { describe, expect, it } from "vitest";
import { contratadoDoContrato, numeroPorExtenso, termosDoContrato, textoPenalidades, textoRescisao } from "./contrato-textos";
import { DEFAULT_PREFERENCIAS } from "./preferencias";

describe("numeroPorExtenso", () => {
  it("escreve como no contrato", () => {
    expect(numeroPorExtenso(0)).toBe("zero");
    expect(numeroPorExtenso(1)).toBe("um");
    expect(numeroPorExtenso(15)).toBe("quinze");
    expect(numeroPorExtenso(20)).toBe("vinte");
    expect(numeroPorExtenso(48)).toBe("quarenta e oito");
    expect(numeroPorExtenso(100)).toBe("cem");
    expect(numeroPorExtenso(101)).toBe("cento e um");
    expect(numeroPorExtenso(720)).toBe("setecentos e vinte");
    expect(numeroPorExtenso(1000)).toBe("mil");
    expect(numeroPorExtenso(1500)).toBe("mil e quinhentos");
    expect(numeroPorExtenso(1230)).toBe("mil duzentos e trinta");
    expect(numeroPorExtenso(2020)).toBe("dois mil e vinte");
  });
});

describe("textos das cláusulas", () => {
  it("com o padrão, o texto é exatamente o de antes", () => {
    expect(textoPenalidades()).toBe(
      "Em caso de descumprimento de quaisquer obrigações previstas neste instrumento, a parte infratora ficará sujeita a: (a) multa de 20% (vinte por cento) sobre o valor total do contrato; (b) responsabilidade integral pelos danos causados, sem prejuízo das demais cominações legais.",
    );
    expect(textoRescisao()).toBe(
      "O presente contrato poderá ser rescindido por qualquer das partes mediante comunicação prévia de 48 (quarenta e oito) horas, respondendo a parte que der causa à rescisão pelas perdas e danos decorrentes.",
    );
  });

  it("interpola os números configurados", () => {
    expect(textoPenalidades({ multaPercentual: 10, avisoRescisaoHoras: 24 })).toContain("multa de 10% (dez por cento)");
    expect(textoRescisao({ multaPercentual: 10, avisoRescisaoHoras: 72 })).toContain("72 (setenta e dois) horas");
    expect(textoRescisao({ multaPercentual: 10, avisoRescisaoHoras: 1 })).toContain("1 (um) hora");
  });
});

describe("retrato do contrato", () => {
  it("contrato antigo sem retrato usa os padrões (texto de antes)", () => {
    expect(contratadoDoContrato(undefined)).toEqual({
      razaoSocial: "Harmonize Bella Prime LTDA",
      cnpj: "41.107.803/0001-27",
      endereco: "Rua Hidelbrando Tourinho, 18, Salas 101 e 102 — Miramar, João Pessoa/PB",
      responsavel: "Eder Campos de Almeida",
      email: "harmonizequip@gmail.com",
      cidadeForo: "João Pessoa/PB",
    });
    expect(termosDoContrato(null)).toEqual(DEFAULT_PREFERENCIAS.contrato);
  });

  it("usa o retrato salvo e completa o que faltar", () => {
    const c = contratadoDoContrato({ razaoSocial: "Outra LTDA", cnpj: "" });
    expect(c.razaoSocial).toBe("Outra LTDA");
    expect(c.cnpj).toBe(DEFAULT_PREFERENCIAS.empresa.cnpj);
    expect(termosDoContrato({ multaPercentual: 0 })).toEqual({ multaPercentual: 0, avisoRescisaoHoras: 48 });
  });
});
