import { describe, it, expect } from "vitest";
import { buscarPendencias, diasEntre } from "./pendencias";
import { buildCobrancaMessage } from "./cobranca";

// Cliente falso do Supabase: devolve linhas fixas e ignora os filtros
// (os filtros em si são do banco). O que se testa aqui é a montagem:
// descarte de saldo zero, locação multi-dia, agrupamento e totais.
function falso(rentals: any[], situacoes: any[]) {
  const consulta = (dados: any[]) => {
    const q: any = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      lt: () => q,
      in: () => q,
      limit: () => Promise.resolve({ data: dados }),
      then: (ok: any) => Promise.resolve({ data: dados }).then(ok),
    };
    return q;
  };
  return {
    from: (tabela: string) => (tabela === "rentals" ? consulta(rentals) : consulta(situacoes)),
  } as any;
}

describe("pendências de pagamento", () => {
  it("diasEntre conta dias de calendário", () => {
    expect(diasEntre("2026-09-30", "2026-10-03")).toBe(3);
    expect(diasEntre("2026-10-03", "2026-10-03")).toBe(0);
  });

  it("agrupa por cliente, soma só saldo > 0 e ignora locação que ainda não terminou", async () => {
    const rentals = [
      { id: "a", client_id: "c1", event_date: "2026-09-20", event_date_end: null, calculated_value: 1000, clients: { name: "ANA", whatsapp: "83999990000", treatment: "Dra.", display_name: "Ana" } },
      { id: "b", client_id: "c1", event_date: "2026-09-25", event_date_end: null, calculated_value: 500, clients: { name: "ANA", whatsapp: "83999990000", treatment: "Dra.", display_name: "Ana" } },
      { id: "c", client_id: "c2", event_date: "2026-09-28", event_date_end: null, calculated_value: 800, clients: { name: "BIA", whatsapp: null, treatment: null, display_name: null } },
      // saldo zero: não entra
      { id: "d", client_id: "c3", event_date: "2026-09-10", event_date_end: null, calculated_value: 300, clients: { name: "CLÁ", whatsapp: null, treatment: null, display_name: null } },
      // multi-dia ainda em andamento: não entra
      { id: "e", client_id: "c4", event_date: "2026-10-02", event_date_end: "2026-10-04", calculated_value: 900, clients: { name: "DÉA", whatsapp: null, treatment: null, display_name: null } },
    ];
    const situacoes = [
      { rental_id: "a", saldo: 750, credito_taxa: 250, total_pago: 0 },
      { rental_id: "b", saldo: 200, credito_taxa: 0, total_pago: 300 },
      { rental_id: "c", saldo: 800, credito_taxa: 0, total_pago: 0 },
      { rental_id: "d", saldo: 0, credito_taxa: 0, total_pago: 300 },
      { rental_id: "e", saldo: 900, credito_taxa: 0, total_pago: 0 },
    ];
    const r = await buscarPendencias(falso(rentals, situacoes), "2026-10-03");
    expect(r.total).toBe(1750);
    expect(r.clientes.map((c) => [c.cliente, c.total])).toEqual([
      ["ANA", 950],
      ["BIA", 800],
    ]);
    expect(r.locacoes).toHaveLength(3);
    expect(r.maiorAtraso).toBe(13);
    expect(r.clientes[0].locacoes.map((l) => l.rentalId)).toEqual(["a", "b"]);
  });

  it("mensagem de cobrança usa saudação genérica sem tratamento, mas mantém o valor", () => {
    const m = buildCobrancaMessage({ treatment: null, displayName: null, locacoes: [{ eventDate: "2026-09-20", saldo: 750 }] });
    expect(m.startsWith("Olá! 😊")).toBe(true);
    expect(m).toContain("750,00");
    const n = buildCobrancaMessage({ treatment: "Dra.", displayName: "Ana", locacoes: [{ eventDate: "2026-09-20", saldo: 750 }, { eventDate: "2026-09-25", saldo: 200 }] });
    expect(n.startsWith("Olá, Dra. Ana! 😊")).toBe(true);
    expect(n).toContain("950,00");
  });
});
