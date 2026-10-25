import { describe, expect, it } from "vitest";
import { mensagemRelacionamento, type Classe } from "./relacionamento";

// Trava o texto de cada classe (escrito antes da etapa 3a, com o texto que
// estava fixo no código). Sem modelos salvos, tem que sair byte a byte igual.
const S = "Olá, Dra. Simone!";
const ESPERADO: Record<Classe, string> = {
  nova: `${S} 😊\n\nComo foram os resultados das suas pacientes com o HIPRO? Fiquei feliz em te atender! Se quiser, já te passo as próximas datas disponíveis.`,
  ativa: `${S} 😊\n\nEstou organizando a agenda dos próximos dias. Quer garantir a sua data do HIPRO? Te mando as disponíveis para a sua região.`,
  em_risco: `${S} 😊\n\nFaz um tempinho que não fazemos um atendimento com o HIPRO! Tenho datas abertas para a sua região. Quer que eu te mande?`,
  sumida: `${S} 😊\n\nFaz um tempinho que não fazemos um atendimento com o HIPRO! Tenho datas abertas para a sua região. Quer que eu te mande?`,
  quente: `${S} 😊\n\nConseguiu ver as informações do HIPRO? Posso reservar uma data para você? As datas desta quinzena estão saindo rápido.`,
  morna: `${S} 😊\n\nPassando para saber se você ainda tem interesse em conhecer o HIPRO. Posso te passar as datas disponíveis para a sua região?`,
  fria: `${S} 😊\n\nPassando para saber se você ainda tem interesse em conhecer o HIPRO. Posso te passar as datas disponíveis para a sua região?`,
  agendada: `${S} 😊\n\nPassando para saber se você ainda tem interesse em conhecer o HIPRO. Posso te passar as datas disponíveis para a sua região?`,
};

describe("mensagemRelacionamento (texto de sempre)", () => {
  for (const classe of Object.keys(ESPERADO) as Classe[]) {
    it(`classe ${classe}`, () => {
      const p = { classe, nome: "Simone", treatment: "Dra.", displayName: "Simone" };
      expect(mensagemRelacionamento(p, S)).toBe(ESPERADO[classe]);
    });
  }

  it("saudação genérica", () => {
    expect(mensagemRelacionamento({ classe: "fria", nome: "", treatment: null, displayName: null }, "Olá!")).toBe(
      "Olá! 😊\n\nPassando para saber se você ainda tem interesse em conhecer o HIPRO. Posso te passar as datas disponíveis para a sua região?"
    );
  });
});
