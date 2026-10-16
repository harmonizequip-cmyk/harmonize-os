import { describe, expect, it } from "vitest";
import { problemaSenha } from "./senha";

describe("regra de senha", () => {
  it("pede 8 caracteres, minúscula, maiúscula e número", () => {
    expect(problemaSenha("Abc1234")).toMatch(/8 caracteres/);
    expect(problemaSenha("ABCD1234")).toMatch(/minúscula/);
    expect(problemaSenha("abcd1234")).toMatch(/maiúscula/);
    expect(problemaSenha("Abcdefgh")).toMatch(/número/);
    expect(problemaSenha("Abcd1234")).toBeNull();
  });
});
