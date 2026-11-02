import { describe, expect, it } from "vitest";
import { mensagemFormulario, separarAcessos, textoComoConheceu, textoMotivo, type ClienteBase } from "./acessos-planejador";

const c = (id: string, nome: string, ehCliente = true): ClienteBase => ({ id, nome, whatsapp: null, cidade: null, ehCliente });

describe("separarAcessos", () => {
  const clientes = [c("a", "Ana"), c("b", "Bia"), c("d", "Duda"), c("e", "Eva"), c("f", "Fran"), c("l", "Lead", false)];
  const perfis = [
    { id: "u1", email: "ana@x", active: true, cliente_id: "a" },
    { id: "u2", email: "bia@x", active: false, cliente_id: "b" },
    { id: "u4", email: "duda@x", active: true, cliente_id: "d" },
  ];
  const g = separarAcessos(clientes, perfis, { a: "2026-12-01", b: "2026-12-01", d: "2026-10-01" }, [{ client_id: "e", email_login: "eva@x", preenchido_em: "2026-11-01" }], "2026-11-02");

  it("separa com acesso, sem acesso e sem cadastro", () => {
    expect(g.comAcesso.map((x) => x.cliente.id)).toEqual(["a"]);
    expect(g.semAcesso.map((x) => [x.cliente.id, x.motivo])).toEqual([
      ["e", "preencheu"],
      ["b", "pausado"],
      ["d", "vencido"],
    ]);
    expect(g.semCadastro.map((x) => x.cliente.id)).toEqual(["f"]);
  });

  it("guarda o e-mail para liberar", () => {
    expect(g.semAcesso.find((x) => x.cliente.id === "e")?.email).toBe("eva@x");
    expect(g.semAcesso.find((x) => x.cliente.id === "b")?.perfil?.id).toBe("u2");
  });

  it("login ligado vale mais que o desligado da mesma cliente", () => {
    const r = separarAcessos([c("a", "Ana")], [
      { id: "u1", email: "velho@x", active: false, cliente_id: "a" },
      { id: "u9", email: "novo@x", active: true, cliente_id: "a" },
    ], { a: "2026-12-01" }, [], "2026-11-02");
    expect(r.comAcesso[0].email).toBe("novo@x");
  });
});

describe("textos", () => {
  it("motivo e mensagem", () => {
    expect(textoMotivo("vencido", "2026-10-01")).toBe("Venceu em 01/10/2026");
    expect(textoMotivo(null, "2026-12-01")).toBe("Até 01/12/2026");
    expect(mensagemFormulario("https://x/cadastro/t")).toContain("https://x/cadastro/t");
  });
});

describe("textoComoConheceu", () => {
  it("mostra a indicação com o nome ou o rótulo", () => {
    expect(textoComoConheceu({ como_conheceu: "indicacao", como_conheceu_rotulo: "Indicação", indicado_por: " Bia " })).toBe("indicação de Bia");
    expect(textoComoConheceu({ como_conheceu: "instagram", como_conheceu_rotulo: "Instagram" })).toBe("Instagram");
    expect(textoComoConheceu({})).toBeNull();
    expect(textoComoConheceu(null)).toBeNull();
  });
  it("leva o formulário junto na linha de quem preencheu", () => {
    const g = separarAcessos([{ id: "e", nome: "Eva", whatsapp: null, cidade: null, ehCliente: true }], [], {}, [{ client_id: "e", email_login: "e@x", preenchido_em: "2026-11-01", comoConheceu: "Instagram" }], "2026-11-02");
    expect(g.semAcesso[0].comoConheceu).toBe("Instagram");
  });
});
