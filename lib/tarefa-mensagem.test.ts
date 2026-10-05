import { describe, it, expect } from "vitest";
import { mensagemDaTarefa } from "./tarefa-mensagem";

const cliente = { name: "DRA. SIMONE KARLA - BOM JARDIM", treatment: null, displayName: null };

describe("mensagem da tarefa", () => {
  it("cobrança de taxa usa o primeiro nome, a data e o valor", () => {
    const m = mensagemDaTarefa({ tipo: "cobranca_taxa", ...cliente, dataEvento: "2026-10-20", valorTaxa: 250 });
    expect(m).toContain("Olá, Dra. Simone!");
    expect(m).toContain("20/10/2026");
    expect(m).toContain("250");
  });

  it("confirmação reaproveita a mensagem de pedir confirmação", () => {
    const m = mensagemDaTarefa({ tipo: "confirmacao", ...cliente, dataEvento: "2026-10-20" });
    expect(m).toContain("seu HIPRO day está chegando: 20/10/2026");
  });

  it("sem data da reserva, cobrança e confirmação não geram mensagem", () => {
    expect(mensagemDaTarefa({ tipo: "cobranca_taxa", ...cliente })).toBeNull();
    expect(mensagemDaTarefa({ tipo: "confirmacao", ...cliente })).toBeNull();
  });

  it("pós-locação e recontato têm mensagem própria com a saudação", () => {
    expect(mensagemDaTarefa({ tipo: "pos_locacao", ...cliente })).toContain("como foi a sua experiência");
    expect(mensagemDaTarefa({ tipo: "recontato", ...cliente })).toContain("datas disponíveis");
  });

  it("tarefa manual não tem mensagem", () => {
    expect(mensagemDaTarefa({ tipo: "manual", ...cliente })).toBeNull();
  });
});
