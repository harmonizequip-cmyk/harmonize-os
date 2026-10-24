import { describe, expect, it } from "vitest";
import { DEFAULT_PREFERENCIAS, codigoDeOrigem, diferencasDoPadrao, lerPreferencias } from "./preferencias";

describe("lerPreferencias", () => {
  it("vazio ou lixo volta ao padrão de sempre", () => {
    expect(lerPreferencias({})).toEqual(DEFAULT_PREFERENCIAS);
    expect(lerPreferencias(null)).toEqual(DEFAULT_PREFERENCIAS);
    expect(lerPreferencias("x")).toEqual(DEFAULT_PREFERENCIAS);
    expect(lerPreferencias([1])).toEqual(DEFAULT_PREFERENCIAS);
  });

  it("aceita número e texto numérico, prende na faixa", () => {
    const p = lerPreferencias({ metas: { min: "20", max: 28, baseLucroDias: 10 }, encaixe: { raioKm: 99999 } });
    expect(p.metas.min).toBe(20);
    expect(p.metas.max).toBe(28);
    expect(p.metas.baseLucroDias).toBe(DEFAULT_PREFERENCIAS.metas.baseLucroDias);
    expect(p.encaixe.raioKm).toBe(DEFAULT_PREFERENCIAS.encaixe.raioKm);
  });

  it("meta máxima menor que a mínima volta às duas padrão", () => {
    const p = lerPreferencias({ metas: { min: 30, max: 10 } });
    expect(p.metas).toMatchObject({ min: 25, max: 30 });
  });

  it("origens: código sem acento, sem repetir, sem vazio", () => {
    const p = lerPreferencias({ listas: { origens: [{ rotulo: "Congresso SP" }, { rotulo: "Congresso SP" }, { rotulo: "" }, { valor: "tiktok", rotulo: "TikTok" }] } });
    expect(p.listas.origens).toEqual([
      { valor: "congresso_sp", rotulo: "Congresso SP" },
      { valor: "tiktok", rotulo: "TikTok" },
    ]);
    expect(codigoDeOrigem("Indicação de amiga!")).toBe("indicacao_de_amiga");
  });

  it("devedores em maiúsculas; lista vazia é aceita", () => {
    expect(lerPreferencias({ listas: { devedores: ["laser dream natal", "laser dream natal", " "] } }).listas.devedores).toEqual(["LASER DREAM NATAL"]);
    expect(lerPreferencias({ listas: { devedores: [] } }).listas.devedores).toEqual([]);
    expect(lerPreferencias({ listas: {} }).listas.devedores).toEqual(DEFAULT_PREFERENCIAS.listas.devedores);
  });

  it("link da Academy só https", () => {
    expect(lerPreferencias({ listas: { linkAcademy: "http://x.com" } }).listas.linkAcademy).toBe(DEFAULT_PREFERENCIAS.listas.linkAcademy);
    expect(lerPreferencias({ listas: { linkAcademy: "https://novo.com/a" } }).listas.linkAcademy).toBe("https://novo.com/a");
  });

  it("dashboard ignora ids desconhecidos", () => {
    const p = lerPreferencias({ dashboard: { avisosOcultos: ["tarefas", "inventado"], blocosOcultos: ["radar", "x"] } });
    expect(p.dashboard.avisosOcultos).toEqual(["tarefas"]);
    expect(p.dashboard.blocosOcultos).toEqual(["radar"]);
  });

  it("fatias VIP e Frequente fora de ordem voltam ao padrão", () => {
    const p = lerPreferencias({ relacionamento: { vipFatia: 0.9, frequenteFatia: 0.6 } });
    expect(p.relacionamento.vipFatia).toBe(0.5);
    expect(p.relacionamento.frequenteFatia).toBe(0.8);
  });

  it("diferencasDoPadrao grava só o que mudou", () => {
    expect(diferencasDoPadrao(DEFAULT_PREFERENCIAS)).toEqual({});
    const p = lerPreferencias({ metas: { min: 22, max: 28 } });
    expect(Object.keys(diferencasDoPadrao(p))).toEqual(["metas"]);
  });
});
