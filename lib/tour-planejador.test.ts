import { describe, expect, it } from "vitest";
import { estadoDeExemplo, NOME_PACIENTE_EXEMPLO, PASSOS_TOUR, tourJaVisto } from "./tour-planejador";
import { normalizarPlano, totalDistribuido } from "./planejador";

describe("tour do planejador", () => {
  it("paciente de exemplo: 10.000 em 2 sessões, com disparos distribuídos sem passar do saldo", () => {
    const p = normalizarPlano(estadoDeExemplo("2026-11-21", "Dra. Ana"));
    expect(p.paciente).toBe(NOME_PACIENTE_EXEMPLO);
    expect(p.sessoesTotal).toBe(2);
    expect(Number(p.saldoTotal)).toBe(10000);
    expect(p.profissional).toBe("Dra. Ana");
    const t = totalDistribuido(p);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThanOrEqual(6000);
  });

  it("todo passo tem título e texto; começa e termina sem destaque", () => {
    for (const p of PASSOS_TOUR) {
      expect(p.titulo.length).toBeGreaterThan(0);
      expect(p.texto.length).toBeGreaterThan(0);
      expect(p.texto).not.toMatch(/—/);
    }
    expect(PASSOS_TOUR[0].alvo).toBeUndefined();
    expect(PASSOS_TOUR[PASSOS_TOUR.length - 1].alvo).toBeUndefined();
  });

  it("convite: visto quando há a chave; sem armazenamento conta como visto", () => {
    expect(tourJaVisto(() => null)).toBe(false);
    expect(tourJaVisto(() => "2026-11-21")).toBe(true);
    expect(
      tourJaVisto(() => {
        throw new Error("bloqueado");
      })
    ).toBe(true);
  });
});
