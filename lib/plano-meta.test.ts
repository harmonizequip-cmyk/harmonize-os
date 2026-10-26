import { describe, expect, it } from "vitest";
import { diasLivresAte, montarPlanoMeta, type EntradaPlanoMeta } from "./plano-meta";

const base: EntradaPlanoMeta = {
  hoje: "2026-11-10",
  metaMin: 25,
  locacoes: 19,
  reservadas: 0,
  diasLivres: ["2026-11-12", "2026-11-14", "2026-11-18", "2026-11-25"],
  datasComGente: [
    { data: "2026-11-12", pessoas: 5 },
    { data: "2026-11-18", pessoas: 2 },
  ],
  paraChamar: 12,
};

describe("diasLivresAte", () => {
  it("conta de amanhã até o fim, sem domingo nem dias ocupados", () => {
    // 2026-11-10 é terça. 15 é domingo; 12 está ocupado.
    const r = diasLivresAte("2026-11-10", "2026-11-16", new Set(["2026-11-12"]));
    expect(r).toEqual(["2026-11-11", "2026-11-13", "2026-11-14", "2026-11-16"]);
  });
});

describe("montarPlanoMeta", () => {
  it("não aparece com a meta batida ou sem meta", () => {
    expect(montarPlanoMeta({ ...base, locacoes: 25 })).toBeNull();
    expect(montarPlanoMeta({ ...base, locacoes: 30 })).toBeNull();
    expect(montarPlanoMeta({ ...base, metaMin: 0 })).toBeNull();
  });

  it("diz quanto falta, as datas livres, as com gente perto e quem chamar", () => {
    const p = montarPlanoMeta(base)!;
    expect(p.faltam).toBe(6);
    expect(p.diasLivres).toBe(4);
    expect(p.datasComGente).toBe(2);
    expect(p.pessoasNasDatas).toBe(7);
    expect(p.frase).toBe(
      "Faltam 6 para a meta. Você tem 4 datas livres até o fim do mês, 2 delas perto de onde você vai estar. 12 pessoas estão na hora de chamar. As datas livres não bastam para a meta cheia: faltam 2 dia(s)."
    );
    expect(p.naoCabe).toBe(true);
    expect(p.principal).toEqual({ rotulo: "Ver quem encaixar (2 datas)", href: "/agenda/encaixe" });
    expect(p.secundaria).toEqual({ rotulo: "Chamar quem está na hora (12)", href: "/relacionamento" });
  });

  it("calcula o ritmo por semana com os dias que sobram", () => {
    // 10/11 a 30/11 = 21 dias = 3 semanas; faltam 6 => 2 por semana.
    expect(montarPlanoMeta(base)!.porSemana).toBe(2);
  });

  it("reservas que fecham a conta não pedem prospecção", () => {
    const p = montarPlanoMeta({ ...base, reservadas: 6 })!;
    expect(p.semReserva).toBe(0);
    expect(p.porSemana).toBeNull();
    expect(p.frase).toContain("As reservas marcadas fecham a conta");
    expect(p.principal).toEqual({ rotulo: "Ver as reservas na agenda", href: "/agenda" });
    expect(p.secundaria).toBeNull();
  });

  it("reservas abatem do que falta e aparecem na frase", () => {
    const p = montarPlanoMeta({ ...base, reservadas: 2, diasLivres: base.diasLivres.concat(["2026-11-26", "2026-11-27"]) })!;
    expect(p.semReserva).toBe(4);
    expect(p.frase.startsWith("Faltam 6 para a meta (2 já reservadas).")).toBe(true);
    expect(p.naoCabe).toBe(false);
  });

  it("sem datas com gente perto, o caminho é chamar quem está na hora", () => {
    const p = montarPlanoMeta({ ...base, datasComGente: [] })!;
    expect(p.principal).toEqual({ rotulo: "Chamar quem está na hora (12)", href: "/relacionamento" });
    expect(p.secundaria).toBeNull();
  });

  it("ignora datas do Encaixe fora do mês e as de hoje para trás", () => {
    const p = montarPlanoMeta({ ...base, datasComGente: [{ data: "2026-12-02", pessoas: 9 }, { data: "2026-11-10", pessoas: 3 }] })!;
    expect(p.datasComGente).toBe(0);
  });

  it("sem ninguém para chamar nem datas, não há botão", () => {
    const p = montarPlanoMeta({ ...base, datasComGente: [], paraChamar: 0 })!;
    expect(p.principal).toBeNull();
    expect(p.frase).not.toContain("na hora de chamar");
  });

  it("no último dia do mês o ritmo ainda é de pelo menos 1 semana", () => {
    const p = montarPlanoMeta({ ...base, hoje: "2026-11-30", diasLivres: [] })!;
    expect(p.diasRestantes).toBe(1);
    expect(p.porSemana).toBe(6);
  });
});
