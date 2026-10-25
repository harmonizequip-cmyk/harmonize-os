import { describe, expect, it } from "vitest";
import {
  IDS_MODELOS,
  MODELOS,
  MODELOS_PADRAO,
  lerModelos,
  mensagemRecibo,
  modelosDiferentes,
  previaDoModelo,
  problemasDoModelo,
  renderizarModelo,
  textoDoModelo,
} from "./mensagens-modelos";
import { mensagemDatasDisponiveis, saudacaoCurta, tratamentoEPrimeiroNome, variaveisDaPessoa } from "./saudacao";
import { buildPedidoConfirmacaoMessage } from "./confirmacao";
import { mensagemDaTarefa } from "./tarefa-mensagem";
import { mensagemRelacionamento, type Classe } from "./relacionamento";
import { mensagemEncaixe } from "./encaixe";
import { formatDate } from "./format";
import { reaisRecibo } from "./recibo-image";
import { DEFAULT_PREFERENCIAS, diferencasDoPadrao, lerPreferencias } from "./preferencias";

// ---------------------------------------------------------------------------
// Cópia literal do código ANTES da etapa 3a. Sem modelo salvo, cada mensagem
// tem que sair byte a byte igual a estas.
// ---------------------------------------------------------------------------
type Nome = { name?: string | null; treatment?: string | null; displayName?: string | null };

const legado = {
  datas(params: Nome) {
    const { tratamento } = tratamentoEPrimeiroNome(params);
    const pacientes = tratamento === "Dr." ? "seus pacientes" : "suas pacientes";
    return (
      `${saudacaoCurta(params)}\n` +
      `Tudo bem? ☺️\n\n` +
      `Passando para te atualizar sobre as datas disponíveis para a locação do HIPRO. ✨\n\n` +
      `Se você já está planejando atender ${pacientes}, esse é um bom momento para escolher a data que melhor se encaixa na sua agenda e começar a organizar seus atendimentos com antecedência.\n\n` +
      `Vou te enviar as datas disponíveis para você avaliar e garantir sua reserva antes que sejam preenchidas. 📅`
    );
  },
  confirmacao(params: Nome & { dateStart: string }) {
    const { tratamento, primeiroNome } = tratamentoEPrimeiroNome(params);
    const saudacao = !primeiroNome
      ? "Olá! 😊"
      : tratamento
        ? `Olá, ${tratamento} ${primeiroNome}! 😊`
        : `Olá, ${primeiroNome}! 😊`;
    return (
      `${saudacao}\n\n` +
      `Passando para lembrar que seu HIPRO day está chegando: ${formatDate(params.dateStart)}.\n\n` +
      `Já estamos organizando tudo por aqui para mais um dia de sucesso. 🚀`
    );
  },
  posLocacao(nome: Nome) {
    const saudacao = `${saudacaoCurta(nome)} 😊`;
    return (
      `${saudacao}\n\n` +
      `Passando para saber como foi a sua experiência com o HIPRO e se ficou alguma dúvida. ` +
      `Foi um prazer atender você! Qualquer coisa, é só me chamar. 🙏`
    );
  },
  contato(nome: Nome) {
    const saudacao = `${saudacaoCurta(nome)} 😊`;
    return (
      `${saudacao}\n\n` +
      `Passando para saber se você ainda tem interesse em conhecer o HIPRO. ` +
      `Posso te passar as datas disponíveis para a sua região?`
    );
  },
  encaixe(p: { nome: string; treatment: string | null; displayName: string | null }, data: string, cidade: string) {
    const d = new Date(`${data}T12:00:00`);
    const dia = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    const semana = d.toLocaleDateString("pt-BR", { weekday: "long" });
    return (
      `${saudacaoCurta({ name: p.nome, treatment: p.treatment, displayName: p.displayName })} ` +
      `Abriu uma data na agenda do HIPRO: ${semana}, ${dia}. Vou estar atendendo em ${cidade} nesses dias e lembrei de você. ` +
      `Quer aproveitar esse dia?`
    );
  },
  recibo(nome: Nome, valor: number, saldo: number) {
    const saudacao = saudacaoCurta(nome);
    return (
      `${saudacao} 😊\n\nRecebi o seu pagamento de ${reaisRecibo(valor)}. Segue o recibo.` +
      (saldo > 0.009 ? ` Fica em aberto ${reaisRecibo(saldo)}.` : " A locação está quitada.") +
      "\n\nObrigada! 🙏"
    );
  },
  tabela(nome: Nome) {
    return (
      `${saudacaoCurta(nome)}\n` +
      `Segue a nossa tabela de preços do HIPRO. ✨\n\n` +
      `Qualquer dúvida, estou à disposição para te ajudar a planejar o seu dia!`
    );
  },
  arte(nome: Nome) {
    return `${saudacaoCurta(nome)} 😊\n\nPara ajudar a lotar a sua agenda do dia do HIPRO, preparei esta arte para você postar no status e no Instagram. Quanto mais pacientes agendados, melhor aproveitamos o dia!`;
  },
  calculo: "Segue o cálculo dos disparos para conferência. 😊",
};

const PESSOAS: Nome[] = [
  { name: "DRA. SIMONE KARLA - BOM JARDIM - PE - HIPRO" },
  { name: "DR ROGÉRIO URTIGA - HIPRO" },
  { name: "CLÍNICA X", treatment: "Dra.", displayName: "Camila Lima" },
  { name: "MAYARA - INSTITUTO EM RECIFE" },
  { name: "+55 81 8650-0644" },
  { name: "" },
  {},
  { treatment: "Dr.", displayName: "Eduardo" },
  { treatment: "  ", displayName: "Camila Lima" },
];

describe("padrão idêntico ao texto de antes (sem nada salvo)", () => {
  for (const [i, p] of PESSOAS.entries()) {
    it(`pessoa ${i}: todas as mensagens`, () => {
      expect(mensagemDatasDisponiveis(p)).toBe(legado.datas(p));
      expect(mensagemDatasDisponiveis(p, {})).toBe(legado.datas(p));
      expect(mensagemDatasDisponiveis(p, DEFAULT_PREFERENCIAS.mensagens)).toBe(legado.datas(p));

      const conf = { name: p.name, treatment: p.treatment, displayName: p.displayName, dateStart: "2026-01-05" };
      expect(buildPedidoConfirmacaoMessage(conf).message).toBe(legado.confirmacao(conf));
      expect(buildPedidoConfirmacaoMessage({ ...conf, modelos: MODELOS_PADRAO }).message).toBe(legado.confirmacao(conf));

      expect(mensagemDaTarefa({ tipo: "pos_locacao", ...p })).toBe(legado.posLocacao(p));
      for (const tipo of ["contato_inicial", "recontato", "followup"] as const) {
        expect(mensagemDaTarefa({ tipo, ...p })).toBe(legado.contato(p));
      }
      expect(mensagemDaTarefa({ tipo: "confirmacao", ...p, dataEvento: "2026-10-20" })).toBe(
        legado.confirmacao({ ...p, dateStart: "2026-10-20" })
      );

      const pe = { nome: p.name ?? "", treatment: p.treatment ?? null, displayName: p.displayName ?? null };
      for (const data of ["2026-11-11", "2026-12-06", "2027-01-01"]) {
        expect(mensagemEncaixe(pe, data, "Caruaru", saudacaoCurta)).toBe(legado.encaixe(pe, data, "Caruaru"));
      }

      const pessoa = variaveisDaPessoa(p);
      for (const [valor, saldo] of [
        [1000, 500],
        [1500, 0],
        [1234.5, 0.005],
        [80, 1234567.89],
      ]) {
        expect(mensagemRecibo({ ...pessoa, valorPago: valor, saldo, reais: reaisRecibo })).toBe(legado.recibo(p, valor, saldo));
      }
      expect(renderizarModelo("tabelaPrecos", pessoa)).toBe(legado.tabela(p));
      expect(renderizarModelo("arteDivulgacao", pessoa)).toBe(legado.arte(p));
      expect(renderizarModelo("calculo", { nome: pessoa.nome })).toBe(legado.calculo);
    });
  }

  it("relacionamento: os 5 textos por classe saem iguais e morna/fria usa o mesmo modelo das tarefas de contato", () => {
    const p = { name: "X", treatment: "Dra.", displayName: "Simone" };
    const s = saudacaoCurta(p);
    const classes: Classe[] = ["nova", "ativa", "em_risco", "sumida", "quente", "morna", "fria", "agendada"];
    for (const classe of classes) {
      const m = mensagemRelacionamento({ classe, nome: "X", treatment: "Dra.", displayName: "Simone" }, s);
      expect(m.startsWith(`${s} 😊\n\n`)).toBe(true);
    }
    expect(mensagemRelacionamento({ classe: "fria", nome: "X", treatment: "Dra.", displayName: "Simone" }, s)).toBe(legado.contato(p));
    // Mudar o modelo "interesse" muda as duas telas juntas.
    const modelos = { interesse: "{saudacao} Ainda quer?" };
    expect(mensagemRelacionamento({ classe: "morna", nome: "X", treatment: "Dra.", displayName: "Simone" }, s, modelos)).toBe(
      "Olá, Dra. Simone! Ainda quer?"
    );
    expect(mensagemDaTarefa({ tipo: "recontato", ...p, modelos })).toBe("Olá, Dra. Simone! Ainda quer?");
  });

  it("textos padrão não têm problema e a prévia usa só variáveis aceitas", () => {
    for (const id of IDS_MODELOS) {
      expect(problemasDoModelo(id, MODELOS[id].padrao)).toEqual([]);
      expect(previaDoModelo(id, MODELOS[id].padrao)).not.toMatch(/[{}]/);
      for (const k of Object.keys(MODELOS[id].exemplo)) expect(MODELOS[id].variaveis).toContain(k);
    }
  });
});

describe("modelo editado", () => {
  it("usa o texto salvo, preserva quebras de linha e emoji", () => {
    const modelos = { confirmacao: "Oi {nome}! 🌸✨\n\nSeu dia é {data}.\n\nAté lá 💜" };
    const { message } = buildPedidoConfirmacaoMessage({ treatment: "Dra.", displayName: "Ana Paula", dateStart: "2026-11-12", modelos });
    expect(message).toBe("Oi Dra. Ana! 🌸✨\n\nSeu dia é 12/11/2026.\n\nAté lá 💜");
  });

  it("variável repetida é trocada todas as vezes", () => {
    expect(renderizarModelo("encaixe", { cidade: "Caruaru", data: "12/11" }, { encaixe: "{cidade}, {data}. De novo: {cidade} em {data}." })).toBe(
      "Caruaru, 12/11. De novo: Caruaru em 12/11."
    );
  });

  it("variável desconhecida volta o modelo inteiro ao padrão", () => {
    const modelos = { posLocacao: "Oi {xyz}, tudo bem?" };
    expect(problemasDoModelo("posLocacao", modelos.posLocacao)).toEqual(["{xyz} não existe."]);
    expect(mensagemDaTarefa({ tipo: "pos_locacao", displayName: "Ana", modelos })).toBe(legado.posLocacao({ displayName: "Ana" }));
  });

  it("variável que o modelo não aceita volta ao padrão", () => {
    const modelos = { tabelaPrecos: "Oi! Seu saldo: {saldo}" };
    expect(problemasDoModelo("tabelaPrecos", modelos.tabelaPrecos)).toEqual(["{saldo} não serve nesta mensagem."]);
    expect(renderizarModelo("tabelaPrecos", { saudacao: "Olá!" }, modelos)).toBe(legado.tabela({}));
  });

  it("chave quebrada volta ao padrão", () => {
    for (const t of ["Oi {saudacao", "Oi saudacao}", "Oi {{saudacao}}", "Oi { } tudo", "Oi {nome}}"]) {
      expect(problemasDoModelo("posLocacao", t).length).toBeGreaterThan(0);
      expect(textoDoModelo("posLocacao", { posLocacao: t })).toBe(MODELOS.posLocacao.padrao);
    }
  });

  it("vazio ou só espaços volta ao padrão (e não é erro)", () => {
    for (const t of ["", "   ", "\n\n  \t"]) {
      expect(problemasDoModelo("arteDivulgacao", t)).toEqual([]);
      expect(textoDoModelo("arteDivulgacao", { arteDivulgacao: t })).toBe(MODELOS.arteDivulgacao.padrao);
    }
  });

  it("grande demais volta ao padrão", () => {
    const t = "a".repeat(1201);
    expect(problemasDoModelo("calculo", t).length).toBe(1);
    expect(renderizarModelo("calculo", {}, { calculo: t })).toBe(legado.calculo);
  });

  it("variável sem valor some sem deixar espaço duplo nem espaço antes da pontuação", () => {
    const modelos = { encaixe: "Vou estar em {cidade} nesses dias. Fica em {cidade}." };
    expect(renderizarModelo("encaixe", { cidade: "" }, modelos)).toBe("Vou estar em nesses dias. Fica em.");
    expect(renderizarModelo("posLocacao", { saudacao: "Olá!", nome: "" }, { posLocacao: "Oi {nome}, tudo bem?\nAbraço {nome}\nFim" })).toBe(
      "Oi, tudo bem?\nAbraço\nFim"
    );
    // Variável no começo sem valor: some sem espaço sobrando no começo de linha.
    expect(renderizarModelo("posLocacao", { nome: "" }, { posLocacao: "{nome}Oi" })).toBe("Oi");
  });
});

describe("gravação em settings.preferencias", () => {
  it("só grava os modelos mudados e ler de volta completa com o padrão", () => {
    const p = lerPreferencias({ mensagens: { calculo: "Segue o cálculo, {nome}." } });
    expect(p.mensagens.calculo).toBe("Segue o cálculo, {nome}.");
    expect(p.mensagens.recibo).toBe(MODELOS.recibo.padrao);
    expect(diferencasDoPadrao(p)).toEqual({ mensagens: { calculo: "Segue o cálculo, {nome}." } });
    expect(diferencasDoPadrao(lerPreferencias({}))).toEqual({});
    expect(modelosDiferentes(MODELOS_PADRAO)).toEqual({});
  });

  it("lerModelos descarta inválido, vazio, não-texto e normaliza \\r\\n", () => {
    const m = lerModelos({ recibo: "Oi {abc}", calculo: "   ", posLocacao: 5, interesse: "  Oi\r\n{saudacao}  ", outro: "x" });
    expect(m.recibo).toBe(MODELOS.recibo.padrao);
    expect(m.calculo).toBe(MODELOS.calculo.padrao);
    expect(m.posLocacao).toBe(MODELOS.posLocacao.padrao);
    expect(m.interesse).toBe("Oi\n{saudacao}");
    expect("outro" in m).toBe(false);
    expect(lerModelos(null)).toEqual(MODELOS_PADRAO);
    expect(lerModelos("lixo")).toEqual(MODELOS_PADRAO);
  });
});
