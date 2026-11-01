import { describe, expect, it } from "vitest";
import { mensagemOrientacoesPos, primeiroNomePaciente } from "./orientacoes-pos";

describe("primeiroNomePaciente", () => {
  it("pega o primeiro nome com a inicial maiúscula", () => {
    expect(primeiroNomePaciente("  MARIA   da Silva ")).toBe("Maria");
    expect(primeiroNomePaciente("ângela")).toBe("Ângela");
    expect(primeiroNomePaciente("")).toBe("");
  });
});

describe("mensagemOrientacoesPos", () => {
  const base = { paciente: "Ana Souza", hoje: "2026-11-01" };
  it("tem saudação, cuidados e linha do tempo", () => {
    const m = mensagemOrientacoesPos(base);
    expect(m.startsWith("Olá, Ana! Seguem os cuidados")).toBe(true);
    expect(m).toContain("FPS 50 ou mais");
    expect(m).toContain("a cada 3 horas");
    expect(m).toContain("48 horas");
    expect(m).toContain("5 dias");
    expect(m).toContain("3 a 5 dias");
    expect(m).toContain("90 a 180 dias");
    expect(m).not.toContain("retorno");
    expect(m).not.toMatch(/[—–]/);
  });
  it("retorno só se for hoje ou depois", () => {
    expect(mensagemOrientacoesPos({ ...base, retorno: "2026-12-15" })).toContain("Seu próximo retorno: 15/12/2026.");
    expect(mensagemOrientacoesPos({ ...base, retorno: "2026-11-01" })).toContain("01/11/2026");
    expect(mensagemOrientacoesPos({ ...base, retorno: "2026-10-01" })).not.toContain("retorno");
  });
  it("assina como a profissional, quando há", () => {
    const m = mensagemOrientacoesPos({ ...base, profissional: " Dra.  Bia " });
    expect(m.endsWith("\n\nDra. Bia")).toBe(true);
  });
  it("sem nome do paciente, só Olá", () => {
    expect(mensagemOrientacoesPos({ paciente: "", hoje: "2026-11-01" }).startsWith("Olá! ")).toBe(true);
  });
});
