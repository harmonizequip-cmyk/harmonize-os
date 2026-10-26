import { describe, expect, it } from "vitest";
import {
  PROXIMIDADE_MINIMA,
  grupoDaDistancia,
  juntar,
  larguraDasZonas,
  marcadoresDoTermometro,
  melhoresDatas,
  mensagemMelhoresDatas,
  mesPadrao,
  nomeDoMes,
  periodoDoMes,
  posicaoNaEscala,
  proximidade,
  rotuloData,
  somarMeses,
  textoDatas,
  textoReferencia,
  type DataLogistica,
} from "./datas-logistica";
import type { MapaCidades } from "./cidades-coordenadas";
import { agendaDoEncaixe } from "./encaixe";

// Mapa de teste numa linha do equador: 1 grau de longitude ≈ 111,19 km.
const KM_GRAU = 111.195;
const mapa: MapaCidades = {
  casa: [0, 0],
  perto: [0, 30 / KM_GRAU],
  medio: [0, 100 / KM_GRAU],
  longe: [0, 300 / KM_GRAU],
  outra: [0, 10 / KM_GRAU],
};

// Novembro de 2026: dia 1 é domingo; 12/11 é quinta.
const base = { mes: "2026-11", hoje: "2026-10-26", pertoKm: 60, raioKm: 150, mapa };

function so(lista: DataLogistica[], dia: string) {
  return lista.find((d) => d.data === dia);
}

describe("melhoresDatas: dia livre", () => {
  it("pula domingo, dia ocupado (um HIPRO só basta) e bloqueio", () => {
    const { ocupados, comCidade } = agendaDoEncaixe(
      [{ date_start: "2026-11-10", date_end: null, event_type: "hipro_1", clients: { city: "Perto" } }],
      [{ data_inicio: "2026-11-20", data_fim: "2026-11-21" }],
      "2026-10-31"
    );
    const lista = melhoresDatas({ ...base, ocupados, eventos: comCidade, cidadePessoa: "Casa" });
    expect(so(lista, "2026-11-01")).toBeUndefined(); // domingo
    expect(so(lista, "2026-11-10")).toBeUndefined(); // hipro_1 ocupado
    expect(so(lista, "2026-11-20")).toBeUndefined(); // bloqueio
    expect(so(lista, "2026-11-21")).toBeUndefined();
    expect(so(lista, "2026-11-11")?.grupo).toBe("perto");
  });

  it("começa amanhã quando o mês é o atual", () => {
    const lista = melhoresDatas({ ...base, mes: "2026-11", hoje: "2026-11-15", ocupados: new Set(), eventos: [], cidadePessoa: "Casa" });
    expect(lista.every((d) => d.data > "2026-11-15")).toBe(true);
    expect(so(lista, "2026-11-16")).toBeDefined();
  });
});

describe("melhoresDatas: classificação", () => {
  const eventos = [
    { data: "2026-11-11", ate: null, cidade: "Perto" },
    { data: "2026-11-13", ate: null, cidade: "Longe" },
    { data: "2026-11-17", ate: null, cidade: "Medio" },
    { data: "2026-11-24", ate: null, cidade: "Longe" },
  ];
  const lista = melhoresDatas({ ...base, ocupados: new Set(["2026-11-11", "2026-11-13", "2026-11-17", "2026-11-24"]), eventos, cidadePessoa: "CASA - PE" });

  it("perto, mais ou menos e longe pela referência mais próxima", () => {
    expect(so(lista, "2026-11-12")?.grupo).toBe("perto");
    expect(so(lista, "2026-11-12")?.referencia?.cidade).toBe("Perto");
    expect(so(lista, "2026-11-12")?.outras.map((r) => r.cidade)).toEqual(["Longe"]);
    expect(so(lista, "2026-11-16")?.grupo).toBe("medio");
    expect(so(lista, "2026-11-23")?.grupo).toBe("longe");
    expect(Math.round(so(lista, "2026-11-23")!.referencia!.km)).toBe(300);
  });

  it("dia sem atendimento ao redor vai para sem referência", () => {
    const d = so(lista, "2026-11-04")!;
    expect(d.grupo).toBe("sem");
    expect(d.motivo).toMatch(/logística livre/);
  });

  it("ordem: grupo, distância, data", () => {
    const grupos = lista.map((d) => d.grupo);
    expect(grupos.indexOf("perto")).toBeLessThan(grupos.indexOf("medio"));
    expect(grupos.lastIndexOf("medio")).toBeLessThan(grupos.indexOf("longe"));
    expect(grupos.lastIndexOf("longe")).toBeLessThan(grupos.indexOf("sem"));
    const sem = lista.filter((d) => d.grupo === "sem").map((d) => d.data);
    expect(sem).toEqual([...sem].sort());
    const perto = lista.filter((d) => d.grupo === "perto");
    expect(perto.map((d) => d.data)).toEqual(["2026-11-10", "2026-11-12"]);
  });

  it("mesma cidade antes e depois junta os dias", () => {
    const l = melhoresDatas({ ...base, ocupados: new Set(), eventos: [{ data: "2026-11-11", ate: null, cidade: "Perto" }, { data: "2026-11-13", ate: null, cidade: "perto" }], cidadePessoa: "Casa" });
    const r = so(l, "2026-11-12")!.referencia!;
    expect(r.dias).toEqual(["2026-11-11", "2026-11-13"]);
    expect(textoReferencia(r)).toBe("atendo em Perto nos dias 11 e 13");
  });

  it("pessoa sem cidade e cidade fora do mapa", () => {
    const sem = melhoresDatas({ ...base, ocupados: new Set(), eventos, cidadePessoa: null });
    expect(so(sem, "2026-11-12")).toMatchObject({ grupo: "sem", cidadesAoRedor: ["Perto", "Longe"] });
    expect(so(sem, "2026-11-12")!.motivo).toMatch(/Sem cidade/);
    const fora = melhoresDatas({ ...base, ocupados: new Set(), eventos, cidadePessoa: "Inventada" });
    expect(so(fora, "2026-11-12")!.motivo).toBe("Inventada não está em Configurações > Cidades.");
  });

  it("atendimento ao redor em cidade fora do mapa ou sem cidade", () => {
    const l = melhoresDatas({ ...base, ocupados: new Set(), eventos: [{ data: "2026-11-11", ate: null, cidade: "Atlântida" }, { data: "2026-11-17", ate: null, cidade: null }], cidadePessoa: "Casa" });
    expect(so(l, "2026-11-12")).toMatchObject({ grupo: "sem", cidadesAoRedor: ["Atlântida"] });
    expect(so(l, "2026-11-12")!.motivo).toMatch(/fora de Configurações/);
    expect(so(l, "2026-11-16")!.motivo).toMatch(/sem cidade/);
  });

  it("virada de mês: atendimento em 01/12 conta para 30/11; 31/10 conta para 02/11", () => {
    const l = melhoresDatas({ ...base, ocupados: new Set(), eventos: [{ data: "2026-12-01", ate: null, cidade: "Perto" }, { data: "2026-10-31", ate: "2026-11-01", cidade: "Medio" }], cidadePessoa: "Casa" });
    expect(so(l, "2026-11-30")?.grupo).toBe("perto");
    expect(so(l, "2026-11-02")?.grupo).toBe("medio");
    expect(periodoDoMes("2026-11")).toEqual({ de: "2026-10-31", ate: "2026-12-01" });
  });
});

describe("faixas", () => {
  it("fronteiras exatas entram no grupo de baixo", () => {
    expect(grupoDaDistancia(60, 60, 150)).toBe("perto");
    expect(grupoDaDistancia(60.01, 60, 150)).toBe("medio");
    expect(grupoDaDistancia(150, 60, 150)).toBe("medio");
    expect(grupoDaDistancia(150.01, 60, 150)).toBe("longe");
    expect(grupoDaDistancia(0, 60, 150)).toBe("perto");
  });
});

describe("termômetro", () => {
  it("posição linear até 2x o raio, presa no teto", () => {
    expect(posicaoNaEscala(0, 60, 150)).toBe(0);
    expect(posicaoNaEscala(60, 60, 150)).toBe(0.2);
    expect(posicaoNaEscala(150, 60, 150)).toBe(0.5);
    expect(posicaoNaEscala(300, 60, 150)).toBe(1);
    expect(posicaoNaEscala(900, 60, 150)).toBe(1);
  });
  it("valores inválidos", () => {
    expect(posicaoNaEscala(NaN, 60, 150)).toBeNull();
    expect(posicaoNaEscala(-5, 60, 150)).toBeNull();
    expect(posicaoNaEscala(10, 200, 150)).toBeNull();
    expect(posicaoNaEscala(10, 60, 0)).toBeNull();
    expect(proximidade(NaN, 60, 150)).toBe(0);
    expect(larguraDasZonas(60, 0)).toEqual({ perto: 0, medio: 0, longe: 1 });
  });
  it("proximidade: cheia perto, quase vazia longe", () => {
    expect(proximidade(0, 60, 150)).toBe(1);
    expect(proximidade(60, 60, 150)).toBeCloseTo(0.8);
    expect(proximidade(150, 60, 150)).toBeCloseTo(0.5);
    expect(proximidade(300, 60, 150)).toBe(PROXIMIDADE_MINIMA);
    expect(proximidade(5000, 60, 150)).toBe(PROXIMIDADE_MINIMA);
  });
  it("zonas proporcionais somam 1", () => {
    const z = larguraDasZonas(60, 150);
    expect(z.perto).toBeCloseTo(0.2);
    expect(z.medio).toBeCloseTo(0.3);
    expect(z.longe).toBe(0.5);
  });
  it("marcadores na mesma distância empilham", () => {
    const d = (data: string, km: number | null): DataLogistica => ({
      data,
      grupo: km === null ? "sem" : grupoDaDistancia(km, 60, 150),
      referencia: km === null ? null : { cidade: "X", dias: [], km },
      outras: [],
      motivo: null,
      cidadesAoRedor: [],
    });
    const m = marcadoresDoTermometro([d("2026-11-12", 30), d("2026-11-10", 30), d("2026-11-14", 31), d("2026-11-16", 200), d("2026-11-17", null)], 60, 150);
    expect(m.map((x) => [x.data, x.nivel])).toEqual([
      ["2026-11-10", 0],
      ["2026-11-12", 1],
      ["2026-11-14", 2],
      ["2026-11-16", 0],
    ]);
  });
});

describe("textos", () => {
  it("rótulo, mês e mês padrão", () => {
    expect(rotuloData("2026-11-12")).toBe("qui 12/11");
    expect(rotuloData("2026-11-14")).toBe("sáb 14/11");
    expect(nomeDoMes("2026-03")).toBe("março");
    expect(mesPadrao("2026-10-20")).toBe("2026-10");
    expect(mesPadrao("2026-10-21")).toBe("2026-11");
    expect(mesPadrao("2026-12-25")).toBe("2027-01");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
    expect(somarMeses("2026-11", 2)).toBe("2027-01");
  });

  it("copiar datas: singular, plural e 'e' antes da última, em ordem", () => {
    expect(textoDatas(["2026-11-12"])).toBe("qui 12/11");
    expect(textoDatas(["2026-11-14", "2026-11-12"])).toBe("qui 12/11 e sáb 14/11");
    expect(textoDatas(["2026-11-16", "2026-11-12", "2026-11-14"])).toBe("qui 12/11, sáb 14/11 e seg 16/11");
    expect(juntar([])).toBe("");
  });

  it("mensagem do WhatsApp", () => {
    expect(mensagemMelhoresDatas("Olá, Dra. Ana!", "2026-11", ["2026-11-14", "2026-11-12"])).toBe(
      "Olá, Dra. Ana!\n\nTenho estas datas livres em novembro: qui 12/11 e sáb 14/11. Qual funciona melhor para você?"
    );
    expect(mensagemMelhoresDatas("Olá!", "2026-11", ["2026-11-12"])).toBe("Olá!\n\nTenho esta data livre em novembro: qui 12/11. Funciona para você?");
  });
});
