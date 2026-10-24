import { describe, expect, it } from "vitest";
import { filtrarAvisosOcultos } from "./avisos-dashboard";

const avisos = [
  { id: "taxas", nivel: "urgente" },
  { id: "tarefas", nivel: "info" },
  { id: "cadastros", nivel: "info" },
  { id: "acesso-1", nivel: "info" },
];

describe("filtrarAvisosOcultos", () => {
  it("sem ocultos devolve tudo", () => {
    expect(filtrarAvisosOcultos(avisos, [])).toEqual(avisos);
  });
  it("esconde os escolhidos, menos urgente e acesso", () => {
    const r = filtrarAvisosOcultos(avisos, ["taxas", "tarefas", "acesso-1"]).map((a) => a.id);
    expect(r).toEqual(["taxas", "cadastros", "acesso-1"]);
  });
});
