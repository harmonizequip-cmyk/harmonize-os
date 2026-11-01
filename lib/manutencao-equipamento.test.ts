import { describe, it, expect } from "vitest";
import {
  situacaoAgua,
  ultimaTrocaPorEquipamento,
  aguaPrecisaTrocar,
  textoAgua,
  textoAvisoAgua,
  faltaSqlManutencao,
  INTERVALO_TROCA_AGUA_DIAS,
} from "./manutencao-equipamento";

describe("troca de água do HIPRO", () => {
  it("intervalo de 15 dias", () => {
    expect(INTERVALO_TROCA_AGUA_DIAS).toBe(15);
  });

  it("nunca registrada", () => {
    const e = situacaoAgua(null, "2026-11-01");
    expect(e).toEqual({ situacao: "nunca", ultima: null, proxima: null, dias: null });
    expect(textoAgua(e)).toBe("Nenhuma troca registrada. Registre a última.");
    expect(aguaPrecisaTrocar(e)).toBe(false);
  });

  it("em dia", () => {
    const e = situacaoAgua("2026-11-01", "2026-11-01");
    expect(e).toEqual({ situacao: "em_dia", ultima: "2026-11-01", proxima: "2026-11-16", dias: 15 });
    expect(textoAgua(e)).toBe("Vence em 15 dias");
  });

  it("vence logo (até 3 dias)", () => {
    expect(situacaoAgua("2026-10-20", "2026-11-01")).toMatchObject({ situacao: "vence_logo", dias: 3 });
    const e = situacaoAgua("2026-10-18", "2026-11-01");
    expect(e).toMatchObject({ situacao: "vence_logo", dias: 1, proxima: "2026-11-02" });
    expect(textoAgua(e)).toBe("Vence em 1 dia");
    expect(aguaPrecisaTrocar(e)).toBe(false);
  });

  it("vence hoje", () => {
    const e = situacaoAgua("2026-10-17", "2026-11-01");
    expect(e).toMatchObject({ situacao: "vence_hoje", dias: 0 });
    expect(textoAgua(e)).toBe("Vence hoje");
    expect(aguaPrecisaTrocar(e)).toBe(true);
    expect(textoAvisoAgua("HIPRO 1", e)).toBe("HIPRO 1 vence hoje");
  });

  it("atrasada, atravessando o mês", () => {
    const e = situacaoAgua("2026-10-10", "2026-11-01");
    expect(e).toMatchObject({ situacao: "atrasada", proxima: "2026-10-25", dias: -7 });
    expect(textoAgua(e)).toBe("Atrasada há 7 dias");
    expect(textoAvisoAgua("HIPRO 2", situacaoAgua("2026-10-16", "2026-11-01"))).toBe("HIPRO 2 atrasada há 1 dia");
  });

  it("última troca por equipamento ignora outros tipos e pega a mais recente", () => {
    const m = ultimaTrocaPorEquipamento([
      { equipment_id: "a", tipo: "troca_agua", feita_em: "2026-10-01" },
      { equipment_id: "a", tipo: "troca_agua", feita_em: "2026-10-20" },
      { equipment_id: "a", tipo: "outro", feita_em: "2026-10-30" },
      { equipment_id: "b", tipo: "troca_agua", feita_em: "2026-10-05" },
    ]);
    expect(m.get("a")).toBe("2026-10-20");
    expect(m.get("b")).toBe("2026-10-05");
    expect(m.get("c")).toBeUndefined();
  });

  it("reconhece o SQL não rodado", () => {
    expect(faltaSqlManutencao({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(faltaSqlManutencao({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(faltaSqlManutencao({ message: 'relation "public.manutencoes_equipamento" does not exist' })).toBe(true);
    expect(faltaSqlManutencao({ code: "P0001", message: "A manutenção não pode ser numa data futura." })).toBe(false);
    expect(faltaSqlManutencao(null)).toBe(false);
  });
});
