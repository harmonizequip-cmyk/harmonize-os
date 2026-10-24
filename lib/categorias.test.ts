import { describe, expect, it } from "vitest";
import { ehDoSistema, limparNomeCategoria, paraEscolha, problemaNomeCategoria, type CategoriaLinha } from "./categorias";

const lista: CategoriaLinha[] = [
  { id: "1", name: "Locação", type: "entrada", scope: "harmonize", sistema: true },
  { id: "2", name: "Outros", type: "entrada", scope: "harmonize", sistema: false },
  { id: "3", name: "Retiradas", type: "saida", scope: "harmonize", sistema: true },
  { id: "4", name: "Combustível", type: "saida", scope: "harmonize", sistema: false },
  { id: "5", name: "Antiga", type: "saida", scope: "harmonize", sistema: false, arquivada: true },
  { id: "6", name: "Saúde", type: "saida", scope: "pessoal", sistema: false },
];

describe("categorias", () => {
  it("lista de escolha: sem arquivadas, menos a do lançamento; ordem pela coluna e depois nome", () => {
    expect(paraEscolha(lista).map((c) => c.id)).not.toContain("5");
    expect(paraEscolha(lista, "5").map((c) => c.id)).toContain("5");
    const ordenadas = paraEscolha([
      { id: "a", name: "Zeta", ordem: 0 },
      { id: "b", name: "Alfa", ordem: 0 },
      { id: "c", name: "Meio", ordem: -1 },
    ]);
    expect(ordenadas.map((c) => c.id)).toEqual(["c", "b", "a"]);
    expect(paraEscolha(null)).toEqual([]);
  });

  it("antes da migration (sem colunas novas) nada some e o cadeado sai da lista fixa", () => {
    const antigas: CategoriaLinha[] = [
      { id: "x", name: "Pagamento de fatura", type: "saida", scope: "pessoal" },
      { id: "y", name: "Mercado", type: "saida", scope: "pessoal" },
    ];
    expect(paraEscolha(antigas)).toHaveLength(2);
    expect(ehDoSistema(antigas[0])).toBe(true);
    expect(ehDoSistema(antigas[1])).toBe(false);
    expect(ehDoSistema({ id: "z", name: "Locação", type: "entrada", sistema: false })).toBe(false);
  });

  it("confere o nome como o banco", () => {
    expect(limparNomeCategoria("  Marketing   digital ")).toBe("Marketing digital");
    const alvo = { scope: "harmonize", type: "saida" };
    expect(problemaNomeCategoria("", alvo, lista)).toMatch(/Escreva/);
    expect(problemaNomeCategoria("combustível", alvo, lista)).toMatch(/Já existe/);
    expect(problemaNomeCategoria("Combustivel", alvo, lista)).toMatch(/parecida/);
    expect(problemaNomeCategoria("locação", alvo, lista)).toMatch(/do sistema/);
    expect(problemaNomeCategoria("Taxa extra", { scope: "pessoal", type: "entrada" }, lista)).toMatch(/reservado/);
    expect(problemaNomeCategoria("Marketing", alvo, lista)).toBeNull();
    // Renomear a própria para outra grafia não acusa duplicada.
    expect(problemaNomeCategoria("COMBUSTÍVEL", { id: "4", ...alvo }, lista)).toBeNull();
    // Mesmo nome em outro espaço pode.
    expect(problemaNomeCategoria("Combustível", { scope: "pessoal", type: "saida" }, lista)).toBeNull();
    expect(problemaNomeCategoria("x".repeat(61), alvo, lista)).toMatch(/longo/);
  });
});
