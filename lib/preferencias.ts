// Preferências configuráveis em Configurações (settings.preferencias, jsonb).
// Tudo aqui tem um padrão igual ao que antes estava fixo no código: coluna
// vazia ou valor inválido volta ao padrão, então nada quebra por falta de
// configuração. lerPreferencias() é a única porta de entrada: completa o que
// falta e prende cada número na faixa válida.

import { lerModelos, MODELOS_PADRAO, modelosDiferentes, type ModelosMensagem } from "./mensagens-modelos";

export type ClasseCadencia = "nova" | "ativa" | "em_risco" | "sumida" | "quente" | "morna" | "fria";

export interface Preferencias {
  metas: {
    /** Meta mínima de locações no mês. */
    min: number;
    /** Meta máxima de locações no mês. */
    max: number;
    /** Janela (dias) da média de lucro por locação usada no "quanto falta" das contas fixas. */
    baseLucroDias: number;
  };
  deslocamento: {
    /** Quanto se cobra por bloco de km (ida e volta). */
    valorPorBloco: number;
    /** Tamanho do bloco em km (ida e volta). */
    kmPorBloco: number;
  };
  relacionamento: {
    /** Dias sem conversa para a pessoa voltar à lista, por classe. */
    cadencia: Record<ClasseCadencia, number>;
    /** Máximo de pessoas em "Chamar hoje". */
    limiteDiario: number;
    /** Em risco: passou de N vezes o ritmo da cliente. */
    riscoMultiplicador: number;
    /** Em risco: no mínimo N dias sem locar. */
    riscoMinimoDias: number;
    /** Em risco: dias quando a cliente ainda não tem ritmo (menos de 2 locações). */
    riscoSemRitmoDias: number;
    /** Sumida: mais de N dias sem locar. */
    sumidaDias: number;
    /** Nova: 1 locação, até N dias. */
    novaAteDias: number;
    /** Lead morno: conversa nos últimos N dias. */
    mornaDias: number;
    /** VIP: fatia (0 a 1) do faturamento acumulada pelas primeiras clientes. */
    vipFatia: number;
    /** Frequente: até essa fatia (0 a 1) do faturamento. */
    frequenteFatia: number;
  };
  encaixe: {
    raioKm: number;
    diasAFrente: number;
    /** Máximo de pessoas listadas por data livre. */
    porData: number;
    /** Perguntar "Ver quem encaixar" ao cancelar ou reagendar. */
    perguntarAoCancelar: boolean;
    /** Cidade base da imagem de datas (vazio = sem regra de viagem). */
    cidadeBase: string;
  };
  listas: {
    /** Origens do lead. `valor` é o código gravado em clients.origem e nunca muda depois de criado. */
    origens: { valor: string; rotulo: string }[];
    /** Devedores sugeridos no Novo lançamento de empréstimo (nome em maiúsculas). */
    devedores: string[];
    /** Link de convite da Contourline Academy. */
    linkAcademy: string;
  };
  dashboard: {
    /** Quantos avisos aparecem de início em "Precisa de você". */
    avisosVisiveis: number;
    /** Ids de avisos escondidos (ver AVISOS_DASHBOARD). Os de dinheiro urgente nunca somem. */
    avisosOcultos: string[];
    /** Ids de blocos escondidos (ver BLOCOS_DASHBOARD). */
    blocosOcultos: string[];
  };
  planejador: {
    /** Dias de antecedência da lista "Retornos nos próximos N dias". */
    retornoDias: number;
    /** Perfis de disparos do seletor (nome e quantidade). */
    perfis: { nome: string; disparos: number }[];
  };
  recibo: {
    /** Oferecer o recibo depois de receber um pagamento. */
    oferecer: boolean;
  };
  /** Dados da Harmonize em contrato, recibo e prontuário/ficha do paciente. */
  empresa: {
    razaoSocial: string;
    cnpj: string;
    endereco: string;
    /** Quem assina pela Harmonize no contrato. */
    responsavel: string;
    email: string;
    /** Cidade do foro do contrato (também a cidade da data no fim do contrato). */
    cidadeForo: string;
    /** Rodapé do prontuário e da ficha do paciente. */
    rodapeDocumentos: string;
    /** Rodapé da imagem do recibo. */
    rodapeRecibo: string;
  };
  /** Números do contrato de locação (o texto jurídico continua fixo). */
  contrato: {
    /** 6ª cláusula: multa sobre o valor total do contrato, em %. */
    multaPercentual: number;
    /** 7ª cláusula: aviso prévio para rescindir, em horas. */
    avisoRescisaoHoras: number;
  };
  /** Arte da tabela de preços. */
  tabelaPrecos: {
    /** Estimativas por procedimento, em duas colunas (até 6). */
    estimativas: EstimativaDisparos[];
    /** Linha em destaque embaixo das estimativas (procedimento vazio = sem destaque). */
    destaque: EstimativaDisparos;
    /** Itens de "Informações importantes" (lista vazia tira o quadro). */
    infos: string[];
    /** Nota em itálico embaixo das estimativas. */
    nota: string;
  };
  /**
   * Textos das mensagens de WhatsApp do app (lib/mensagens-modelos.ts). Um
   * texto por modelo; padrão = o texto de sempre. Cobrança, taxa e avisos do
   * celular ficam de fora (duplicados na função alertas).
   */
  mensagens: ModelosMensagem;
}

export interface EstimativaDisparos {
  procedimento: string;
  disparos: number;
}

/** Limites dos grupos de texto (usados também nas telas, em maxLength). */
export const LIMITES_TEXTO = {
  empresaCurto: 120,
  empresaLongo: 200,
  procedimento: 40,
  info: 80,
  nota: 160,
  maxEstimativas: 6,
  maxInfos: 6,
} as const;

/** Avisos do Dashboard que podem ser escondidos (id usado em dashboard/page.tsx). */
export const AVISOS_DASHBOARD: { id: string; rotulo: string; dica: string }[] = [
  { id: "taxas", rotulo: "Taxas de reserva a receber", dica: "Reservas com a taxa ainda pendente." },
  { id: "sem-disparos", rotulo: "Atendimentos sem disparos lançados", dica: "Já passaram e ainda não foram cobrados." },
  { id: "revisao", rotulo: "Revisão anual dos HIPROs", dica: "30 dias antes ou vencida." },
  { id: "confirmacoes", rotulo: "Atendimentos sem confirmação", dica: "Nos próximos 7 dias." },
  { id: "tarefas", rotulo: "Fila de tarefas", dica: "Tarefas de hoje e atrasadas." },
  { id: "encaixe", rotulo: "Datas livres para encaixar", dica: "Perto de onde você vai estar." },
  { id: "relacionamento", rotulo: "Pessoas para chamar hoje", dica: "Clientes e leads na hora de uma conversa." },
  { id: "aplicadores", rotulo: "Garantia de aplicador acabando", dica: "Entre 90% e 100% da garantia." },
  { id: "cadastros", rotulo: "Cadastros novos do formulário", dica: "Conferir e liberar na Academy." },
];

/** Blocos do Dashboard que podem ser escondidos (o destaque do mês e "Precisa de você" ficam sempre). */
export const BLOCOS_DASHBOARD: { id: string; rotulo: string }[] = [
  { id: "dinheiro", rotulo: "Saldo em caixa e A receber" },
  { id: "previsao", rotulo: "Previsão de caixa" },
  { id: "radar", rotulo: "Radar de oportunidades" },
  { id: "proximos", rotulo: "Próximos dias" },
  { id: "numeros", rotulo: "Números do período e gráficos" },
];

export const DEFAULT_PREFERENCIAS: Preferencias = {
  metas: { min: 25, max: 30, baseLucroDias: 90 },
  deslocamento: { valorPorBloco: 50, kmPorBloco: 50 },
  relacionamento: {
    cadencia: { nova: 10, ativa: 21, em_risco: 14, sumida: 30, quente: 3, morna: 7, fria: 30 },
    limiteDiario: 8,
    riscoMultiplicador: 1.5,
    riscoMinimoDias: 30,
    riscoSemRitmoDias: 60,
    sumidaDias: 120,
    novaAteDias: 60,
    mornaDias: 14,
    vipFatia: 0.5,
    frequenteFatia: 0.8,
  },
  encaixe: { raioKm: 150, diasAFrente: 30, porData: 12, perguntarAoCancelar: true, cidadeBase: "" },
  listas: {
    origens: [
      { valor: "indicacao", rotulo: "Indicação" },
      { valor: "instagram", rotulo: "Instagram" },
      { valor: "whatsapp", rotulo: "WhatsApp" },
      { valor: "formulario", rotulo: "Formulário" },
      { valor: "outro", rotulo: "Outro" },
    ],
    devedores: ["LASER DREAM CAMPINA GRANDE", "LASER DREAM JOÃO PESSOA"],
    linkAcademy: "https://academy.contourline.com.br/invites/xOP09Q/join",
  },
  dashboard: { avisosVisiveis: 4, avisosOcultos: [], blocosOcultos: [] },
  planejador: {
    retornoDias: 15,
    perfis: [
      { nome: "Leve", disparos: 8000 },
      { nome: "Moderado", disparos: 12000 },
      { nome: "Pesado", disparos: 16000 },
    ],
  },
  recibo: { oferecer: true },
  empresa: {
    razaoSocial: "Harmonize Bella Prime LTDA",
    cnpj: "41.107.803/0001-27",
    endereco: "Rua Hidelbrando Tourinho, 18, Salas 101 e 102 — Miramar, João Pessoa/PB",
    responsavel: "Eder Campos de Almeida",
    email: "harmonizequip@gmail.com",
    cidadeForo: "João Pessoa/PB",
    rodapeDocumentos: "Harmonize · Locação de Equipamentos Médicos e Estéticos",
    rodapeRecibo: "Obrigado pela confiança! Harmonize · Locação de equipamentos",
  },
  contrato: { multaPercentual: 20, avisoRescisaoHoras: 48 },
  tabelaPrecos: {
    estimativas: [
      { procedimento: "Full face", disparos: 12000 },
      { procedimento: "Terço inferior", disparos: 4000 },
      { procedimento: "Papada", disparos: 2000 },
      { procedimento: "Pescoço", disparos: 2000 },
      { procedimento: "Pálpebra inferior", disparos: 800 },
      { procedimento: "Fox eyes", disparos: 800 },
    ],
    destaque: { procedimento: "Full face + pescoço + papada", disparos: 16000 },
    infos: [
      "Não existe mínimo de disparos.",
      "Deslocamento cobrado à parte, conforme a localização.",
      "Valores referentes ao uso do equipamento HIPRO.",
      "Pacote válido para uma única locação (até 12 horas).",
    ],
    nota: "Valores médios por região. Podem variar conforme a avaliação do profissional.",
  },
  mensagens: MODELOS_PADRAO,
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Número dentro da faixa; fora dela ou inválido, devolve o padrão. */
function num(v: unknown, padrao: number, min: number, max: number, inteiro = true): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : NaN;
  if (!Number.isFinite(n) || n < min || n > max) return padrao;
  return inteiro ? Math.round(n) : n;
}
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);
const texto = (v: unknown, padrao: string, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : padrao);
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Código de origem: minúsculas sem acento, só letras, números e _. */
export function codigoDeOrigem(rotulo: string): string {
  return rotulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

/** Completa e valida o que veio do banco. Nunca lança. */
export function lerPreferencias(bruto: unknown): Preferencias {
  const d = DEFAULT_PREFERENCIAS;
  const r = obj(bruto);

  const metas = obj(r.metas);
  let min = num(metas.min, d.metas.min, 0, 500);
  let max = num(metas.max, d.metas.max, 0, 500);
  if (max < min) [min, max] = [d.metas.min, d.metas.max];

  const desl = obj(r.deslocamento);

  const rel = obj(r.relacionamento);
  const cad = obj(rel.cadencia);
  const cadencia = {} as Record<ClasseCadencia, number>;
  for (const k of Object.keys(d.relacionamento.cadencia) as ClasseCadencia[]) {
    cadencia[k] = num(cad[k], d.relacionamento.cadencia[k], 1, 365);
  }
  let vipFatia = num(rel.vipFatia, d.relacionamento.vipFatia, 0.05, 0.95, false);
  let frequenteFatia = num(rel.frequenteFatia, d.relacionamento.frequenteFatia, 0.05, 0.99, false);
  if (frequenteFatia <= vipFatia) [vipFatia, frequenteFatia] = [d.relacionamento.vipFatia, d.relacionamento.frequenteFatia];

  const enc = obj(r.encaixe);

  const lis = obj(r.listas);
  const origens: { valor: string; rotulo: string }[] = [];
  const vistos = new Set<string>();
  for (const o of lista(lis.origens)) {
    const oo = obj(o);
    const rotulo = texto(oo.rotulo, "", 40);
    const valor = codigoDeOrigem(texto(oo.valor, "", 40) || rotulo);
    if (!rotulo || !valor || vistos.has(valor)) continue;
    vistos.add(valor);
    origens.push({ valor, rotulo });
  }
  const devedores: string[] = [];
  for (const dv of lista(lis.devedores)) {
    const nome = texto(dv, "", 60).toUpperCase();
    if (nome && !devedores.includes(nome)) devedores.push(nome);
  }
  const link = texto(lis.linkAcademy, d.listas.linkAcademy, 400);

  const dash = obj(r.dashboard);
  const idsAviso = new Set(AVISOS_DASHBOARD.map((a) => a.id));
  const idsBloco = new Set(BLOCOS_DASHBOARD.map((b) => b.id));

  const pl = obj(r.planejador);
  const perfis: { nome: string; disparos: number }[] = [];
  for (const p of lista(pl.perfis)) {
    const pp = obj(p);
    const nome = texto(pp.nome, "", 30);
    const disparos = num(pp.disparos, -1, 100, 100000, true);
    if (nome && disparos > 0) perfis.push({ nome, disparos });
  }

  const emp = obj(r.empresa);
  const L = LIMITES_TEXTO;
  // Texto obrigatório: vazio volta ao padrão (contrato sem razão social não serve).
  const obrig = (v: unknown, padrao: string, max: number) => texto(v, padrao, max) || padrao;

  const ctr = obj(r.contrato);

  const tp = obj(r.tabelaPrecos);
  const estimativa = (v: unknown): EstimativaDisparos | null => {
    const e = obj(v);
    const procedimento = texto(e.procedimento, "", L.procedimento);
    const disparos = num(e.disparos, -1, 10, 200000);
    return procedimento && disparos > 0 ? { procedimento, disparos } : null;
  };
  const estimativas = lista(tp.estimativas)
    .map(estimativa)
    .filter((e): e is EstimativaDisparos => !!e)
    .slice(0, L.maxEstimativas);
  const destBruto = obj(tp.destaque);
  const destaque =
    "destaque" in tp
      ? typeof destBruto.procedimento === "string" && destBruto.procedimento.trim() === ""
        ? { procedimento: "", disparos: 0 }
        : (estimativa(tp.destaque) ?? d.tabelaPrecos.destaque)
      : d.tabelaPrecos.destaque;
  const infos = lista(tp.infos)
    .map((x) => texto(x, "", L.info))
    .filter(Boolean)
    .slice(0, L.maxInfos);

  return {
    metas: { min, max, baseLucroDias: num(metas.baseLucroDias, d.metas.baseLucroDias, 30, 365) },
    deslocamento: {
      valorPorBloco: num(desl.valorPorBloco, d.deslocamento.valorPorBloco, 0, 5000, false),
      kmPorBloco: num(desl.kmPorBloco, d.deslocamento.kmPorBloco, 5, 500, false),
    },
    relacionamento: {
      cadencia,
      limiteDiario: num(rel.limiteDiario, d.relacionamento.limiteDiario, 1, 50),
      riscoMultiplicador: num(rel.riscoMultiplicador, d.relacionamento.riscoMultiplicador, 1, 5, false),
      riscoMinimoDias: num(rel.riscoMinimoDias, d.relacionamento.riscoMinimoDias, 1, 365),
      riscoSemRitmoDias: num(rel.riscoSemRitmoDias, d.relacionamento.riscoSemRitmoDias, 1, 730),
      sumidaDias: num(rel.sumidaDias, d.relacionamento.sumidaDias, 1, 1095),
      novaAteDias: num(rel.novaAteDias, d.relacionamento.novaAteDias, 1, 365),
      mornaDias: num(rel.mornaDias, d.relacionamento.mornaDias, 1, 180),
      vipFatia,
      frequenteFatia,
    },
    encaixe: {
      raioKm: num(enc.raioKm, d.encaixe.raioKm, 10, 1000),
      diasAFrente: num(enc.diasAFrente, d.encaixe.diasAFrente, 3, 90),
      porData: num(enc.porData, d.encaixe.porData, 1, 50),
      perguntarAoCancelar: bool(enc.perguntarAoCancelar, d.encaixe.perguntarAoCancelar),
      cidadeBase: texto(enc.cidadeBase, d.encaixe.cidadeBase, 60),
    },
    listas: {
      origens: origens.length ? origens : d.listas.origens,
      // Lista vazia é válida (o dono tirou todos); só volta ao padrão se o campo nem existir.
      devedores: Array.isArray(lis.devedores) ? devedores : d.listas.devedores,
      linkAcademy: /^https:\/\//.test(link) ? link : d.listas.linkAcademy,
    },
    dashboard: {
      avisosVisiveis: num(dash.avisosVisiveis, d.dashboard.avisosVisiveis, 1, 12),
      avisosOcultos: lista(dash.avisosOcultos).filter((x): x is string => typeof x === "string" && idsAviso.has(x)),
      blocosOcultos: lista(dash.blocosOcultos).filter((x): x is string => typeof x === "string" && idsBloco.has(x)),
    },
    planejador: {
      retornoDias: num(pl.retornoDias, d.planejador.retornoDias, 1, 90),
      perfis: perfis.length ? perfis : d.planejador.perfis,
    },
    recibo: { oferecer: bool(obj(r.recibo).oferecer, d.recibo.oferecer) },
    empresa: {
      razaoSocial: obrig(emp.razaoSocial, d.empresa.razaoSocial, L.empresaCurto),
      cnpj: obrig(emp.cnpj, d.empresa.cnpj, 30),
      endereco: obrig(emp.endereco, d.empresa.endereco, L.empresaLongo),
      responsavel: obrig(emp.responsavel, d.empresa.responsavel, L.empresaCurto),
      email: obrig(emp.email, d.empresa.email, L.empresaCurto),
      cidadeForo: obrig(emp.cidadeForo, d.empresa.cidadeForo, 60),
      // Rodapés podem ficar vazios (o dono tirou a frase).
      rodapeDocumentos: texto(emp.rodapeDocumentos, d.empresa.rodapeDocumentos, L.empresaLongo),
      rodapeRecibo: texto(emp.rodapeRecibo, d.empresa.rodapeRecibo, L.empresaLongo),
    },
    contrato: {
      multaPercentual: num(ctr.multaPercentual, d.contrato.multaPercentual, 0, 100),
      avisoRescisaoHoras: num(ctr.avisoRescisaoHoras, d.contrato.avisoRescisaoHoras, 1, 720),
    },
    tabelaPrecos: {
      estimativas: estimativas.length ? estimativas : d.tabelaPrecos.estimativas,
      destaque,
      // Lista vazia é válida (tira o quadro); só volta ao padrão se o campo nem existir.
      infos: Array.isArray(tp.infos) ? infos : d.tabelaPrecos.infos,
      nota: texto(tp.nota, d.tabelaPrecos.nota, L.nota),
    },
    // Ausente, vazio, grande demais ou com variável errada: o texto de sempre.
    mensagens: lerModelos(r.mensagens),
  };
}

/** Só o que difere do padrão, para gravar sem encher a coluna de valores iguais. */
export function diferencasDoPadrao(p: Preferencias): Obj {
  const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const saida: Obj = {};
  for (const grupo of Object.keys(DEFAULT_PREFERENCIAS) as (keyof Preferencias)[]) {
    if (grupo === "mensagens") {
      // Mensagens: só os modelos mudados (o resto segue o padrão, mesmo se ele mudar no código).
      const mudadas = modelosDiferentes(p.mensagens);
      if (Object.keys(mudadas).length) saida.mensagens = mudadas;
      continue;
    }
    if (!igual(p[grupo], DEFAULT_PREFERENCIAS[grupo])) saida[grupo] = p[grupo];
  }
  return saida;
}
