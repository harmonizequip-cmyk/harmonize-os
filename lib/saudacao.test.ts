import { describe, it, expect } from "vitest";
import { saudacaoCurta, mensagemDatasDisponiveis } from "./saudacao";

describe("saudação curta", () => {
  it("tira tratamento e primeiro nome do campo Nome quando é tudo o que há", () => {
    expect(saudacaoCurta({ name: "DRA. SIMONE KARLA - BOM JARDIM - PE - HIPRO" })).toBe("Olá, Dra. Simone!");
    expect(saudacaoCurta({ name: "DR ROGÉRIO URTIGA - HIPRO" })).toBe("Olá, Dr. Rogério!");
  });

  it("prefere tratamento e nome de exibição do cadastro, usando só o primeiro nome", () => {
    expect(saudacaoCurta({ name: "CLÍNICA X", treatment: "Dra.", displayName: "Camila Lima" })).toBe("Olá, Dra. Camila!");
    expect(saudacaoCurta({ name: "QUALQUER", treatment: "Dra.", displayName: "Dra. Ana Carolina" })).toBe("Olá, Dra. Ana!");
  });

  it("sem tratamento, usa só o primeiro nome", () => {
    expect(saudacaoCurta({ name: "MAYARA - INSTITUTO EM RECIFE" })).toBe("Olá, Mayara!");
  });

  it("nome que é telefone ou vazio vira saudação genérica", () => {
    expect(saudacaoCurta({ name: "+55 81 8650-0644" })).toBe("Olá!");
    expect(saudacaoCurta({ name: "" })).toBe("Olá!");
    expect(saudacaoCurta({})).toBe("Olá!");
  });

  it("mensagem de datas fala de locação do HIPRO e não de sessão", () => {
    const m = mensagemDatasDisponiveis({ name: "DRA. SIMONE KARLA - BOM JARDIM - PE - HIPRO" });
    expect(m.startsWith("Olá, Dra. Simone!\nTudo bem? ☺️\n\n")).toBe(true);
    expect(m).toContain("locação do HIPRO");
    expect(m).not.toContain("sessão");
  });

  it("mensagem de datas usa 'seus pacientes' para Dr. e 'suas pacientes' para Dra.", () => {
    expect(mensagemDatasDisponiveis({ treatment: "Dr.", displayName: "Rogério" })).toContain("seus pacientes");
    expect(mensagemDatasDisponiveis({ treatment: "Dra.", displayName: "Simone" })).toContain("suas pacientes");
  });
});
