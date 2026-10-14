import { describe, expect, it } from "vitest";
import { acharParecidos, linkAcademyPreenchido, dividirCidadeEstado, notaDoCadastro, tratamentoSugerido, type CadastroRecebido, type ClienteParaComparar } from "./cadastro-formulario";

const cad = (p: Partial<CadastroRecebido>): CadastroRecebido => ({
  id: "x", respondido_em: null, recebido_em: "", nome: null, profissao: null, whatsapp: null, email: null, empresa: null, estabelecimento: null, cidade_estado: null, ...p,
});
const cli = (p: Partial<ClienteParaComparar>): ClienteParaComparar => ({
  id: "c", name: "", display_name: null, treatment: null, whatsapp: null, email: null, clinic_name: null, city: null, state: null, notes: null, is_client: false, ...p,
});

describe("dividirCidadeEstado", () => {
  it("separa os formatos comuns", () => {
    expect(dividirCidadeEstado("João Pessoa/PB")).toEqual({ cidade: "João Pessoa", uf: "PB" });
    expect(dividirCidadeEstado("Campina Grande - pb")).toEqual({ cidade: "Campina Grande", uf: "PB" });
    expect(dividirCidadeEstado("Recife PE")).toEqual({ cidade: "Recife", uf: "PE" });
    expect(dividirCidadeEstado("Patos")).toEqual({ cidade: "Patos", uf: null });
    expect(dividirCidadeEstado("")).toEqual({ cidade: null, uf: null });
  });
});

describe("acharParecidos", () => {
  const clientes = [
    cli({ id: "1", name: "DRA. ANA LIMA - MAGRAS - HIPRO", whatsapp: "(83) 99999-1234" }),
    cli({ id: "2", name: "BIA SOUZA", email: "bia@x.com" }),
    cli({ id: "3", name: "CARLA DE OLIVEIRA SANTOS" }),
  ];
  it("acha por WhatsApp, e-mail e nome", () => {
    expect(acharParecidos(cad({ whatsapp: "5583999991234" }), clientes)[0]).toMatchObject({ cliente: { id: "1" }, motivo: "mesmo WhatsApp" });
    expect(acharParecidos(cad({ email: "BIA@x.com " }), clientes)[0]).toMatchObject({ cliente: { id: "2" }, motivo: "mesmo e-mail" });
    expect(acharParecidos(cad({ nome: "Carla Santos" }), clientes)[0]).toMatchObject({ cliente: { id: "3" }, motivo: "nome parecido" });
    expect(acharParecidos(cad({ nome: "Fulana Nova" }), clientes)).toEqual([]);
  });
});

describe("textos do cadastro", () => {
  it("nota e tratamento", () => {
    expect(notaDoCadastro(cad({ profissao: "Biomédica", estabelecimento: "Clínica" }))).toBe("Formulário Academy: Profissão: Biomédica · Estabelecimento: Clínica");
    expect(tratamentoSugerido(cad({ profissao: "Médica" }))).toBe("Dra.");
    expect(tratamentoSugerido(cad({ profissao: "Biomédico" }))).toBe("Dr.");
    expect(tratamentoSugerido(cad({ nome: "Dra. Ana", profissao: "Esteticista" }))).toBe("Dra.");
    expect(tratamentoSugerido(cad({ profissao: "Esteticista" }))).toBe("");
  });
});

describe("linkAcademyPreenchido", () => {
  it("leva nome e e-mail no endereço", () => {
    expect(linkAcademyPreenchido("Ana Lima", "Ana@X.com")).toBe("https://academy.contourline.com.br/invites/xOP09Q/join?name=Ana+Lima&email=ana%40x.com");
    expect(linkAcademyPreenchido(null, null)).toBe("https://academy.contourline.com.br/invites/xOP09Q/join");
  });
});
