import { describe, expect, it } from "vitest";
import {
  chavePaciente,
  filtrarSessoes,
  montarLinhaDoTempo,
  normalizarNome,
  planosDoPaciente,
  resumirHistorico,
  saldoParaProximaSessao,
  type EntradaHistorico,
} from "./historico-paciente";

const entrada = (id: string, data: string, estado: Record<string, unknown>, extra: Partial<EntradaHistorico> = {}): EntradaHistorico => ({
  id,
  estado,
  data,
  data_retorno: null,
  procedimento: "Full Face",
  saldo_total: 16000,
  total_disparos: 0,
  updated_at: `${data}T10:00:00Z`,
  ...extra,
});

// Pacote de 16.000 em 2 sessões: 10.000 na primeira, a segunda aberta com 4.000.
const doisTempos = entrada("p1", "2026-10-20", {
  paciente: "Ana Souza",
  data: "2026-12-19",
  saldoTotal: "16000",
  procNome: "Full Face",
  sessoesTotal: 2,
  sessaoAtual: 2,
  sessoesAnteriores: [{ n: 1, data: "2026-10-20", DATA: { frontal: [{ prof: "4.5", dispD: 500, dispE: 500 }], papada: [{ prof: "10.0", disp: 9000 }] }, customAreas: [] }],
  DATA: { jowls: [{ prof: "3.0", dispD: 1000, dispE: 1000 }], pescoco: [{ prof: "4.5", dispD: 1000, dispE: 1000 }] },
});

describe("histórico do paciente", () => {
  it("acentos, maiúsculas e espaços juntam o mesmo paciente", () => {
    expect(normalizarNome("  JOÃO   da Silva ")).toBe("joao da silva");
    const a = { client_id: "c1", paciente: "João da Silva" };
    const b = { client_id: "c1", paciente: " joao  DA silva" };
    const outraCliente = { client_id: "c2", paciente: "João da Silva" };
    const outro = { client_id: "c1", paciente: "Maria" };
    expect(chavePaciente(a.client_id, a.paciente)).toBe(chavePaciente(b.client_id, b.paciente));
    expect(planosDoPaciente([a, b, outraCliente, outro], a)).toEqual([a, b]);
  });

  it("sessões saem da mais recente para a mais antiga, com áreas e saldo para a próxima", () => {
    const tempo = montarLinhaDoTempo([doisTempos]);
    expect(tempo.map((s) => s.n)).toEqual([2, 1]);
    const s1 = tempo[1];
    expect(s1.total).toBe(10000);
    expect(s1.areas).toEqual(expect.arrayContaining([{ nome: "Frontal", total: 1000 }, { nome: "Papada", total: 9000 }]));
    expect(s1.saldoParaProxima).toBe(6000);
    expect(s1.retorno).toBe("2026-12-19"); // a data da sessão seguinte
    expect(s1.aberta).toBe(false);
    const s2 = tempo[0];
    expect(s2.total).toBe(4000);
    expect(s2.aberta).toBe(true);
    expect(s2.saldoParaProxima).toBe(0); // última sessão
    expect(s2.sessoes).toBe(2);
  });

  it("ordena planejamentos diferentes pela data da sessão", () => {
    const antigo = entrada("p0", "2026-01-10", { paciente: "Ana Souza", data: "2026-01-10", saldoTotal: "8000", DATA: { frontal: [{ prof: "4.5", dispD: 300, dispE: 300 }] } });
    const tempo = montarLinhaDoTempo([antigo, doisTempos]);
    expect(tempo.map((s) => `${s.planoId}:${s.n}`)).toEqual(["p1:2", "p1:1", "p0:1"]);
  });

  it("filtra por período e por texto (área ou procedimento, sem acento)", () => {
    const tempo = montarLinhaDoTempo([doisTempos]);
    expect(filtrarSessoes(tempo, { de: "2026-11-01" }).map((s) => s.n)).toEqual([2]);
    expect(filtrarSessoes(tempo, { ate: "2026-11-01" }).map((s) => s.n)).toEqual([1]);
    expect(filtrarSessoes(tempo, { de: "2026-10-20", ate: "2026-10-20" }).map((s) => s.n)).toEqual([1]);
    expect(filtrarSessoes(tempo, { texto: "PAPADA" }).map((s) => s.n)).toEqual([1]);
    expect(filtrarSessoes(tempo, { texto: "pescoco" }).map((s) => s.n)).toEqual([2]);
    expect(filtrarSessoes(tempo, { texto: "full" }).length).toBe(2);
    expect(filtrarSessoes(tempo, { texto: "nada disso" })).toEqual([]);
  });

  it("resumo: sessões, disparos usados e saldo restante do pacote mais recente", () => {
    const r = resumirHistorico([doisTempos]);
    expect(r).toMatchObject({ sessoes: 2, usados: 14000, saldoRestante: 2000, planejamentos: 1 });
  });

  it("plano antigo, sem sessões no estado, vira uma sessão só", () => {
    const antigo = entrada("p9", "2026-05-05", { paciente: "Bia", data: "2026-05-05", saldoTotal: "12000", DATA: { frontal: [{ prof: "4.5", dispD: 400, dispE: 400 }] } });
    const tempo = montarLinhaDoTempo([antigo]);
    expect(tempo).toHaveLength(1);
    expect(tempo[0]).toMatchObject({ n: 1, sessoes: 1, total: 800, saldoParaProxima: 0, aberta: true });
  });

  it("saldo para a próxima sessão pelas colunas da lista", () => {
    expect(saldoParaProximaSessao({ saldo_total: 16000, total_disparos: 10000, sessoes_total: 2, sessao_atual: 1 })).toBe(6000);
    expect(saldoParaProximaSessao({ saldo_total: 16000, total_disparos: 16000, sessoes_total: 2, sessao_atual: 1 })).toBe(0);
    expect(saldoParaProximaSessao({ saldo_total: 16000, total_disparos: 14000, sessoes_total: 2, sessao_atual: 2 })).toBe(0); // última sessão
    expect(saldoParaProximaSessao({ saldo_total: 12000, total_disparos: 8000 })).toBe(0); // plano antigo: uma sessão
    expect(saldoParaProximaSessao({ saldo_total: 10000, total_disparos: 12000, sessoes_total: 3, sessao_atual: 1 })).toBe(0);
  });
});
