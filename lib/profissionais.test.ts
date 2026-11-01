import { describe, expect, it } from "vitest";
import {
  escolhaAutomatica,
  faltaSql,
  nomeRepetido,
  problemaProfissional,
  profissionaisDaCliente,
  profissionalDoPlano,
  rotuloProfissional,
  type Profissional,
} from "./profissionais";

const p = (id: string, client_id: string, nome: string, ativo = true, registro: string | null = null): Profissional => ({ id, client_id, nome, registro, ativo });

const lista = [p("1", "a", "Maria", false), p("2", "a", "Dra. Ana Souza", true, "CRBM 1234"), p("3", "b", "Joana"), p("4", "a", "Bia")];

describe("profissionais da clínica", () => {
  it("só as da cliente, ativas primeiro e por nome", () => {
    expect(profissionaisDaCliente(lista, "a").map((x) => x.id)).toEqual(["4", "2", "1"]);
    expect(profissionaisDaCliente(lista, null)).toEqual([]);
  });

  it("acha a do planejamento pelo id ou, nos antigos, pelo nome sem acento", () => {
    expect(profissionalDoPlano(lista, { profissionalId: "4", profissional: "Outro" })?.id).toBe("4");
    expect(profissionalDoPlano(lista, { profissional: " DRA.  ana souza" })?.id).toBe("2");
    expect(profissionalDoPlano(lista, { profissionalId: "sumiu", profissional: "Bia" })?.id).toBe("4");
    expect(profissionalDoPlano(lista, { profissional: "" })).toBeNull();
  });

  it("uma ativa só já vem escolhida, sem trocar o que alguém escreveu", () => {
    const uma = [p("1", "a", "Maria", false), p("2", "a", "Dra. Ana")];
    expect(escolhaAutomatica(uma, { profissional: "" })?.id).toBe("2");
    expect(escolhaAutomatica(uma, { profissional: "Ana Clínica" }, "Ana Clínica")?.id).toBe("2");
    expect(escolhaAutomatica(uma, { profissional: "Fulana" }, "Ana Clínica")).toBeNull();
    expect(escolhaAutomatica(uma, { profissional: "", profissionalId: "1" })).toBeNull();
    expect(escolhaAutomatica(lista.filter((x) => x.client_id === "a"), { profissional: "" })).toBeNull();
  });

  it("rótulo, validação, nome repetido e falta de SQL", () => {
    expect(rotuloProfissional({ nome: "Ana", registro: " CRBM 1 " })).toBe("Ana · CRBM 1");
    expect(rotuloProfissional({ nome: "Ana", registro: null })).toBe("Ana");
    expect(problemaProfissional({ nome: "   " })).toBe("Escreva o nome da profissional.");
    expect(problemaProfissional({ nome: "Ana", registro: "x".repeat(61) })).toBe("Registro grande demais.");
    expect(problemaProfissional({ nome: "Ana" })).toBeNull();
    expect(nomeRepetido(lista, "dra. ANA souza")?.id).toBe("2");
    expect(nomeRepetido(lista, "dra. ANA souza", "2")).toBeNull();
    expect(faltaSql({ code: "42P01" })).toBe(true);
    expect(faltaSql({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(faltaSql({ code: "42501", message: "permission denied" })).toBe(false);
    expect(faltaSql(null)).toBe(false);
  });
});
