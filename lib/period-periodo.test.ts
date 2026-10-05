import { describe, it, expect } from "vitest";
import { diasDoPeriodo, duracaoEmDias } from "./period";

describe("período de vários dias", () => {
  it("lista todos os dias, inclusive o primeiro e o último", () => {
    expect(diasDoPeriodo("2026-10-20", "2026-10-22")).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });

  it("um dia só, ou sem data final, devolve só o dia", () => {
    expect(diasDoPeriodo("2026-10-20", "2026-10-20")).toEqual(["2026-10-20"]);
    expect(diasDoPeriodo("2026-10-20", null)).toEqual(["2026-10-20"]);
  });

  it("atravessa a virada de mês", () => {
    expect(diasDoPeriodo("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("não passa do limite quando o dado vem errado", () => {
    expect(diasDoPeriodo("2026-01-01", "2030-01-01", 10)).toHaveLength(10);
  });

  it("conta a duração em dias de calendário", () => {
    expect(duracaoEmDias("2026-10-20", "2026-10-22")).toBe(3);
    expect(duracaoEmDias("2026-10-20", null)).toBe(1);
    expect(duracaoEmDias("2026-10-30", "2026-11-02")).toBe(4);
  });
});
