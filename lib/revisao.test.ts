import { describe, it, expect } from "vitest";
import { proximaRevisao, situacaoRevisao } from "./revisao";

describe("revisão anual", () => {
  it("soma um ano", () => {
    expect(proximaRevisao("2026-03-10")).toBe("2027-03-10");
    expect(proximaRevisao("2028-02-29")).toBe("2029-02-28");
  });
  it("situação", () => {
    expect(situacaoRevisao(null, "2026-10-12").situacao).toBe("sem_data");
    expect(situacaoRevisao("2026-01-10", "2026-10-12")).toMatchObject({ situacao: "ok", proxima: "2027-01-10" });
    expect(situacaoRevisao("2025-11-01", "2026-10-12")).toEqual({ situacao: "perto", proxima: "2026-11-01", dias: 20 });
    expect(situacaoRevisao("2025-10-12", "2026-10-12")).toMatchObject({ situacao: "perto", dias: 0 });
    expect(situacaoRevisao("2025-10-01", "2026-10-12")).toEqual({ situacao: "vencida", proxima: "2026-10-01", dias: -11 });
  });
});
