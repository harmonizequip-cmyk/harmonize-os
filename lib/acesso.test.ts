import { describe, expect, it } from "vitest";
import { destinoDoLogin, mensagemPedirAcesso } from "./acesso";

describe("destinoDoLogin", () => {
  it("na dúvida não entra na Harmonize", () => {
    expect(destinoDoLogin(null)).toBe("sem_acesso");
    expect(destinoDoLogin(undefined)).toBe("sem_acesso");
    expect(destinoDoLogin({ is_admin: true, active: true }, true)).toBe("sem_acesso");
    expect(destinoDoLogin({ is_admin: true, active: false })).toBe("sem_acesso");
    expect(destinoDoLogin({ is_admin: true })).toBe("sem_acesso");
    expect(destinoDoLogin({ active: true, permissions: {} })).toBe("sem_acesso");
    expect(destinoDoLogin({ active: true, permissions: { agenda: false, x: "true" } })).toBe("sem_acesso");
  });
  it("cliente vai ao portal, mesmo desligada (o portal mostra o pausado)", () => {
    expect(destinoDoLogin({ cliente_id: "c", active: false, is_admin: true })).toBe("portal");
  });
  it("dono e equipe entram", () => {
    expect(destinoDoLogin({ is_admin: true, active: true })).toBe("harmonize");
    expect(destinoDoLogin({ active: true, permissions: { agenda: true } })).toBe("harmonize");
    expect(destinoDoLogin({ active: true, somente_leitura: true, permissions: { dashboard: true } })).toBe("harmonize");
  });
});

describe("mensagemPedirAcesso", () => {
  it("monta o pedido", () => {
    expect(mensagemPedirAcesso("pausado", "Ana", "a@x")).toContain("pausado e gostaria de pedir a liberação de um novo acesso");
    expect(mensagemPedirAcesso("aguardando", null, null)).toMatch(/^Olá! Tudo bem\. Fiz meu cadastro/);
  });
});
