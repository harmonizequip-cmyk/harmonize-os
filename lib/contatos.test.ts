import { describe, expect, it } from "vitest";
import { formatarTelefone } from "./contatos";

describe("formatarTelefone", () => {
  it("tira o +55 e formata celular", () => {
    expect(formatarTelefone("+55 83 99999-8888")).toBe("(83) 99999-8888");
  });
  it("tira o zero de discagem", () => {
    expect(formatarTelefone("083 3222-1111")).toBe("(83) 3222-1111");
  });
  it("mantém o que não reconhece", () => {
    expect(formatarTelefone(" 12345 ")).toBe("12345");
  });
});
