import { describe, expect, it } from "vitest";
import { normalizarPlano } from "./planejador";
import { dadosFichaAssinada, mensagemFichaAssinada, nomeArquivoFicha } from "./ficha-assinada";
import type { AssinaturaImpressa } from "./planejador-impressao";

const plano = normalizarPlano({
  paciente: "ÉDER Campos",
  data: "2026-12-19",
  saldoTotal: "16000",
  procNome: "Full Face",
  profissional: "Dra. Bia",
  profissionalRegistro: "CRBM 1",
  sessoesTotal: 2,
  sessaoAtual: 2,
  sessoesAnteriores: [{ n: 1, data: "2026-10-20", DATA: { frontal: [{ prof: "1.5", dispD: 500, dispE: 500, feito: true }] }, customAreas: [] }],
  DATA: { jowls: [{ prof: "4.5", dispD: 1000, dispE: 1000 }] },
});

const ass = (papel: "paciente" | "profissional", hash = "abcdef123456"): AssinaturaImpressa => ({
  papel,
  nome: papel === "paciente" ? "Éder" : "Dra. Bia",
  registro: papel === "profissional" ? "CRBM 1" : null,
  assinadaEm: "2026-10-20T15:30:00Z",
  src: "data:image/png;base64,AA",
  hash,
  triagem: papel === "paciente" ? { situacao: "sem", nomes: [], disparoTeste: true, termo: { aceito: true, versao: "2026-11-01", resumo: "" } } as never : null,
});

describe("dadosFichaAssinada", () => {
  it("monta a sessão fechada com o pacote, as áreas e as duas assinaturas", () => {
    const f = dadosFichaAssinada(plano, 1, [ass("paciente"), ass("profissional")], "abcdef123456");
    expect(f.titulo).toBe("Ficha do Paciente · Sessão 1 de 2");
    expect(f.areas).toEqual([{ nome: expect.any(String), total: 1000, feito: true }]);
    expect(f.total).toBe(1000);
    expect(f.pacote.map((x) => x.valor)).toEqual([16000, 1000, 15000]);
    expect(f.campos.find((c) => c.rotulo === "Retorno / próxima sessão")?.valor).toBe("19/12/2026");
    expect(f.assinaturas.map((a) => a.rotulo)).toEqual(["Assinatura do Profissional", "Assinatura do Paciente · Sessão 1"]);
    expect(f.triagem).toContain("Sem contraindicações declaradas");
    expect(f.termo).toContain("versão 2026-11-01");
    expect(f.verificacao).toBe("Conteúdo verificado: abcdef12");
    expect(f.alterada).toBe(false);
  });

  it("avisa quando a sessão mudou depois de assinada", () => {
    const f = dadosFichaAssinada(plano, 1, [ass("paciente")], "outro");
    expect(f.alterada).toBe(true);
    expect(f.verificacao).toContain("ATENÇÃO");
  });
});

describe("mensagem e arquivo", () => {
  it("usa o primeiro nome e tira acento do arquivo", () => {
    expect(mensagemFichaAssinada("ÉDER Campos", 1, 2)).toBe(
      "Olá, Éder! Segue a ficha da Sessão 1 do seu procedimento com o HIPRO, assinada por você e pela profissional. Guarde para o seu controle."
    );
    expect(mensagemFichaAssinada("", 1, 1)).toMatch(/^Olá! Segue a ficha do seu/);
    expect(nomeArquivoFicha("ÉDER Campos", 1)).toBe("Ficha HIPRO - Eder - Sessao 1.pdf");
  });
});
