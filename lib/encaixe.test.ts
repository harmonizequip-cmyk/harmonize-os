import { describe, expect, it } from "vitest";
import { coordenadasDaCidade, distanciaKm, normalizarCidade } from "./cidades-coordenadas";
import { ancorasDoDia, candidatasPerto, mensagemEncaixe, oportunidadesDeEncaixe } from "./encaixe";
import type { PessoaClassificada } from "./relacionamento";

function pessoa(id: string, cidade: string | null, extra: Partial<PessoaClassificada> = {}): PessoaClassificada {
  return {
    id, nome: `Dra. ${id}`, treatment: "Dra.", displayName: id, whatsapp: "83999990000", cidade,
    stage: "cliente", ehCliente: true, parceiro: false, criadoEm: "2026-01-01", locacoes: [],
    proximaReserva: null, ultimoContato: null, deve: 0, tarefasPendentes: 0,
    classe: "ativa", valor: "comum", totalFaturado: 0, ultimaLocacao: null, ritmo: null,
    diasSemLocar: null, diasSemContato: 0, cadencia: 21, devida: false, motivo: null, prioridade: 0,
    ...extra,
  };
}

describe("cidades", () => {
  it("normaliza acento, caixa e UF", () => {
    expect(normalizarCidade("JOÃO PESSOA - PB")).toBe("joao pessoa");
    expect(coordenadasDaCidade("Vitória de Santo Antão")).not.toBeNull();
    expect(coordenadasDaCidade("Cidade Inventada")).toBeNull();
  });
  it("distância Recife-Caruaru perto de 120 km em linha reta", () => {
    const km = distanciaKm(coordenadasDaCidade("Recife")!, coordenadasDaCidade("Caruaru")!);
    expect(km).toBeGreaterThan(100);
    expect(km).toBeLessThan(130);
  });
});

describe("encaixe", () => {
  const eventos = [
    { data: "2026-11-10", ate: null, cidade: "Caruaru" },
    { data: "2026-11-12", ate: null, cidade: "CARUARU" },
  ];

  it("acha onde ele vai estar no dia anterior e seguinte, sem repetir a cidade", () => {
    expect(ancorasDoDia("2026-11-11", eventos)).toEqual([{ dia: "2026-11-10", cidade: "Caruaru" }]);
    expect(ancorasDoDia("2026-11-20", eventos)).toEqual([]);
  });

  it("pega quem está até o raio, sem reserva, na ordem certa", () => {
    const lista = candidatasPerto([{ dia: "2026-11-10", cidade: "Caruaru" }], [
      pessoa("longe", "Natal"),
      pessoa("perto", "Gravatá"),
      pessoa("devida", "Recife", { devida: true }),
      pessoa("marcada", "Bezerros", { proximaReserva: "2026-12-01" }),
      pessoa("semcidade", null),
    ]);
    expect(lista.map((c) => c.pessoa.id)).toEqual(["devida", "perto"]);
    expect(lista[1].perto).toBe("Caruaru");
  });

  it("só oferece dia livre, fora domingo, colado a um atendimento", () => {
    const pessoas = [pessoa("a", "Bezerros")];
    const ops = oportunidadesDeEncaixe({
      hoje: "2026-11-01",
      ocupados: new Set(["2026-11-10", "2026-11-12"]),
      eventos,
      pessoas,
      diasAFrente: 20,
    });
    // 09/11 (véspera do 10), 11/11 (entre os dois) e 13/11 (dia seguinte ao 12)
    expect(ops.map((o) => o.data)).toEqual(["2026-11-09", "2026-11-11", "2026-11-13"]);
    const domingo = oportunidadesDeEncaixe({ hoje: "2026-11-01", ocupados: new Set(), eventos: [{ data: "2026-11-07", ate: null, cidade: "Caruaru" }], pessoas, somenteDia: "2026-11-08" });
    expect(domingo).toEqual([]);
  });

  it("mensagem com tratamento, data e cidade", () => {
    const m = mensagemEncaixe({ nome: "Ana Lima", treatment: "Dra.", displayName: "Ana" }, "2026-11-11", "Caruaru", () => "Olá, Dra. Ana!");
    expect(m).toContain("Olá, Dra. Ana!");
    expect(m).toContain("11/11");
    expect(m).toContain("Caruaru");
  });

  it("raio e janela configuráveis (padrão 150 km e 30 dias)", () => {
    const ancoras = [{ dia: "2026-11-10", cidade: "Caruaru" }];
    const pessoas = [pessoa("perto", "Gravatá")];
    expect(candidatasPerto(ancoras, pessoas)).toHaveLength(1);
    expect(candidatasPerto(ancoras, pessoas, 10)).toHaveLength(0);
    const params = { hoje: "2026-11-01", ocupados: new Set(["2026-11-10"]), eventos, pessoas };
    expect(oportunidadesDeEncaixe(params).map((o) => o.data)).toContain("2026-11-09");
    expect(oportunidadesDeEncaixe({ ...params, diasAFrente: 3 })).toEqual([]);
    expect(oportunidadesDeEncaixe({ ...params, raioKm: 10 })).toEqual([]);
  });
});
