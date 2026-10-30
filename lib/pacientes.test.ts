import { describe, expect, it } from "vitest";
import { agruparPorPaciente, idade, pacienteBate, pacienteDeMesmoNome, sugerirPacientes, type PacienteCadastro, type PlanoDoPaciente } from "./pacientes";

const plano = (o: Partial<PlanoDoPaciente>): PlanoDoPaciente => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  client_id: "A",
  paciente: "Lúcia Pinto",
  paciente_id: null,
  data: "2026-10-01",
  data_retorno: null,
  procedimento: "Full Face",
  saldo_total: 0,
  total_disparos: 0,
  updated_at: "2026-10-01T10:00:00Z",
  cliente_nome: "Dra. Ana",
  ...o,
});

const cad = (o: Partial<PacienteCadastro>): PacienteCadastro => ({ id: "p1", client_id: "A", nome: "Lúcia Pinto", whatsapp: null, nascimento: null, observacoes: null, ...o });

describe("agruparPorPaciente", () => {
  it("junta pelo cadastro e usa o nome dele", () => {
    const r = agruparPorPaciente(
      [plano({ id: "1", paciente_id: "p1", paciente: "lucia" }), plano({ id: "2", paciente_id: "p1", data: "2026-10-20", procedimento: "Papada" })],
      [cad({ nome: "Lúcia Pinto Souza" })]
    );
    expect(r).toHaveLength(1);
    expect(r[0].nome).toBe("Lúcia Pinto Souza");
    expect(r[0].planos.map((p) => p.id)).toEqual(["2", "1"]);
    expect(r[0].ultimaData).toBe("2026-10-20");
    expect(r[0].ultimoProcedimento).toBe("Papada");
  });

  it("sem cadastro, junta pela mesma cliente e mesmo nome sem acento", () => {
    const r = agruparPorPaciente([plano({ paciente: "Lúcia  Pinto" }), plano({ paciente: "lucia pinto" }), plano({ paciente: "Lúcia Pinto", client_id: "B" })]);
    expect(r).toHaveLength(2);
  });

  it("planejamento sem nome fica sozinho", () => {
    const r = agruparPorPaciente([plano({ id: "x", paciente: "" }), plano({ id: "y", paciente: null })]);
    expect(r).toHaveLength(2);
    expect(r[0].nome).toBe("");
  });

  it("marca o saldo para a próxima sessão e soma", () => {
    const r = agruparPorPaciente([
      plano({ id: "1", paciente_id: "p1", saldo_total: 16000, total_disparos: 10000, sessoes_total: 2, sessao_atual: 1 }),
      plano({ id: "2", paciente_id: "p1", saldo_total: 8000, total_disparos: 8000, sessoes_total: 1, sessao_atual: 1 }),
      plano({ id: "3", paciente_id: "p1", saldo_total: 9000, total_disparos: 6000, sessoes_total: 3, sessao_atual: 3 }),
    ]);
    expect(r[0].saldos).toHaveLength(1);
    expect(r[0].saldos[0]).toMatchObject({ saldo: 6000, proximaSessao: 2, sessoes: 2 });
    expect(r[0].saldoTotal).toBe(6000);
    expect(r[0].sessoes).toBe(5);
  });

  it("retorno: só de hoje em diante, o mais perto", () => {
    const r = agruparPorPaciente(
      [plano({ data_retorno: "2026-09-01" }), plano({ data_retorno: "2026-12-01" }), plano({ data_retorno: "2026-11-05" })],
      [],
      "2026-10-30"
    );
    expect(r[0].retorno).toBe("2026-11-05");
  });

  it("cadastro sem planejamento também aparece", () => {
    const r = agruparPorPaciente([], [cad({ id: "p9", nome: "Sem Plano" })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ pacienteId: "p9", nome: "Sem Plano", planos: [] });
  });

  it("ordena pelo atendido mais recente", () => {
    const r = agruparPorPaciente([plano({ paciente: "Ana", data: "2026-01-01" }), plano({ paciente: "Bia", data: "2026-05-01" })]);
    expect(r.map((x) => x.nome)).toEqual(["Bia", "Ana"]);
  });
});

describe("busca e sugestões", () => {
  it("pacienteBate procura nome, cliente e procedimento", () => {
    const [r] = agruparPorPaciente([plano({ procedimento: "Full Face + Papada" })]);
    expect(pacienteBate(r, "lucia")).toBe(true);
    expect(pacienteBate(r, "ana")).toBe(true);
    expect(pacienteBate(r, "papada")).toBe(true);
    expect(pacienteBate(r, "joão")).toBe(false);
  });

  it("sugere primeiro quem começa com o texto", () => {
    const lista = [cad({ id: "1", nome: "Maria Lúcia" }), cad({ id: "2", nome: "Lúcia Pinto" }), cad({ id: "3", nome: "Bruna" })];
    expect(sugerirPacientes(lista, "luc").map((c) => c.id)).toEqual(["2", "1"]);
  });

  it("acha o cadastro de mesmo nome", () => {
    expect(pacienteDeMesmoNome([cad({})], "  LUCIA   pinto ")?.id).toBe("p1");
    expect(pacienteDeMesmoNome([cad({})], "Lúcia")).toBeNull();
  });

  it("idade", () => {
    expect(idade("1990-11-01", "2026-10-30")).toBe(35);
    expect(idade("1990-10-30", "2026-10-30")).toBe(36);
    expect(idade(null, "2026-10-30")).toBeNull();
  });
});
