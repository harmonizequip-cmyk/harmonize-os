// Mensagens de WhatsApp editáveis em Configurações > Mensagens (etapa 3a).
//
// Cada modelo tem um texto padrão IGUAL ao que estava fixo no código (os
// testes em mensagens-modelos.test.ts conferem byte a byte) e uma lista de
// variáveis que aceita, escritas entre chaves: {saudacao}, {data}...
//
// Regra de segurança: se o texto salvo tiver variável desconhecida, variável
// que aquele modelo não aceita ou chave quebrada ("{data" ou "}"), o modelo
// INTEIRO volta ao padrão. Nunca sai mensagem com "{xyz}" literal.
//
// Ficam de fora de propósito (continuam fixos no código): saudação
// (tratamento e primeiro nome, sempre a variável {saudacao}), cobrança de
// locação e de taxa (duplicadas na função alertas), resumo da locação,
// acesso ao Planejador, títulos de tarefa no SQL, avisos do celular e textos
// da IA.
//
// Este arquivo não importa nada do app, para poder ser usado por
// lib/preferencias.ts e pelas funções de mensagem sem import circular.

export type VariavelId =
  | "saudacao"
  | "nome"
  | "data"
  | "dia_semana"
  | "cidade"
  | "valor"
  | "saldo"
  | "situacao"
  | "pacientes";

export const VARIAVEIS: Record<VariavelId, { rotulo: string; dica: string }> = {
  saudacao: { rotulo: "Saudação", dica: "\"Olá, Dra. Simone!\" (tratamento e primeiro nome; sem nome, \"Olá!\")" },
  nome: { rotulo: "Nome", dica: "Tratamento e primeiro nome, sem o \"Olá\" (pode ficar vazio)" },
  data: { rotulo: "Data", dica: "Data do atendimento" },
  dia_semana: { rotulo: "Dia da semana", dica: "Ex.: quinta-feira" },
  cidade: { rotulo: "Cidade", dica: "Onde você vai estar" },
  valor: { rotulo: "Valor pago", dica: "Valor recebido agora" },
  saldo: { rotulo: "Saldo", dica: "Quanto fica em aberto (R$ 0,00 se quitada)" },
  situacao: { rotulo: "Situação", dica: "\"Fica em aberto R$ ...\" ou \"A locação está quitada.\"" },
  pacientes: { rotulo: "Pacientes", dica: "\"seus pacientes\" para Dr., \"suas pacientes\" para os demais" },
};

export type ModeloId =
  | "datasDisponiveis"
  | "confirmacao"
  | "posLocacao"
  | "interesse"
  | "relacionamentoNova"
  | "relacionamentoAtiva"
  | "relacionamentoRisco"
  | "relacionamentoQuente"
  | "encaixe"
  | "recibo"
  | "tabelaPrecos"
  | "arteDivulgacao"
  | "calculo";

export interface DefModelo {
  titulo: string;
  /** Onde a mensagem aparece (para o dono saber o que está mudando). */
  quando: string;
  grupo: "Agenda" | "Tarefas e relacionamento" | "Imagens e recibo";
  padrao: string;
  variaveis: VariavelId[];
  /** Valores da prévia. */
  exemplo: Partial<Record<VariavelId, string>>;
}

export const TAMANHO_MAXIMO_MENSAGEM = 1200;

const EX_PESSOA = { saudacao: "Olá, Dra. Simone!", nome: "Dra. Simone" };

// Textos padrão: copiados do código de antes, trocando ${...} pela variável.
export const MODELOS: Record<ModeloId, DefModelo> = {
  datasDisponiveis: {
    titulo: "Datas disponíveis",
    quando: "Junto da imagem de datas livres (Agenda > Imagem de datas).",
    grupo: "Agenda",
    padrao:
      `{saudacao}\n` +
      `Tudo bem? ☺️\n\n` +
      `Passando para te atualizar sobre as datas disponíveis para a locação do HIPRO. ✨\n\n` +
      `Se você já está planejando atender {pacientes}, esse é um bom momento para escolher a data que melhor se encaixa na sua agenda e começar a organizar seus atendimentos com antecedência.\n\n` +
      `Vou te enviar as datas disponíveis para você avaliar e garantir sua reserva antes que sejam preenchidas. 📅`,
    variaveis: ["saudacao", "nome", "pacientes"],
    exemplo: { ...EX_PESSOA, pacientes: "suas pacientes" },
  },
  confirmacao: {
    titulo: "Pedido de confirmação",
    quando: "Botão \"Pedir confirmação no WhatsApp\" (Agenda, Funil e tarefa de confirmação).",
    grupo: "Agenda",
    padrao:
      `{saudacao} 😊\n\n` +
      `Passando para lembrar que seu HIPRO day está chegando: {data}.\n\n` +
      `Já estamos organizando tudo por aqui para mais um dia de sucesso. 🚀`,
    variaveis: ["saudacao", "nome", "data"],
    exemplo: { ...EX_PESSOA, data: "12/11/2026" },
  },
  encaixe: {
    titulo: "Oferecer data livre (encaixe)",
    quando: "Botão \"Oferecer\" em Agenda > Encaixe.",
    grupo: "Agenda",
    padrao:
      `{saudacao} ` +
      `Abriu uma data na agenda do HIPRO: {dia_semana}, {data}. Vou estar atendendo em {cidade} nesses dias e lembrei de você. ` +
      `Quer aproveitar esse dia?`,
    variaveis: ["saudacao", "nome", "data", "dia_semana", "cidade"],
    exemplo: { ...EX_PESSOA, data: "12/11", dia_semana: "quinta-feira", cidade: "Caruaru" },
  },
  posLocacao: {
    titulo: "Pós-locação",
    quando: "Tarefa de pós-locação (Tarefas, fila e Funil).",
    grupo: "Tarefas e relacionamento",
    padrao:
      `{saudacao} 😊\n\n` +
      `Passando para saber como foi a sua experiência com o HIPRO e se ficou alguma dúvida. ` +
      `Foi um prazer atender você! Qualquer coisa, é só me chamar. 🙏`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  interesse: {
    titulo: "Ainda tem interesse?",
    quando: "Tarefas de primeiro contato, follow-up e recontato, e Relacionamento para leads mornos e frios.",
    grupo: "Tarefas e relacionamento",
    padrao:
      `{saudacao} 😊\n\n` +
      `Passando para saber se você ainda tem interesse em conhecer o HIPRO. ` +
      `Posso te passar as datas disponíveis para a sua região?`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  relacionamentoNova: {
    titulo: "Relacionamento: cliente nova",
    quando: "Chamar hoje, para quem fez a primeira locação há pouco.",
    grupo: "Tarefas e relacionamento",
    padrao: `{saudacao} 😊\n\nComo foram os resultados das suas pacientes com o HIPRO? Fiquei feliz em te atender! Se quiser, já te passo as próximas datas disponíveis.`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  relacionamentoAtiva: {
    titulo: "Relacionamento: cliente ativa",
    quando: "Chamar hoje, para quem loca no ritmo dela e está sem data marcada.",
    grupo: "Tarefas e relacionamento",
    padrao: `{saudacao} 😊\n\nEstou organizando a agenda dos próximos dias. Quer garantir a sua data do HIPRO? Te mando as disponíveis para a sua região.`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  relacionamentoRisco: {
    titulo: "Relacionamento: em risco ou sumida",
    quando: "Chamar hoje, para quem passou do tempo de voltar ou sumiu.",
    grupo: "Tarefas e relacionamento",
    padrao: `{saudacao} 😊\n\nFaz um tempinho que não fazemos um atendimento com o HIPRO! Tenho datas abertas para a sua região. Quer que eu te mande?`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  relacionamentoQuente: {
    titulo: "Relacionamento: lead quente",
    quando: "Chamar hoje, para lead com interesse ou data em vista.",
    grupo: "Tarefas e relacionamento",
    padrao: `{saudacao} 😊\n\nConseguiu ver as informações do HIPRO? Posso reservar uma data para você? As datas desta quinzena estão saindo rápido.`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  recibo: {
    titulo: "Recibo",
    quando: "Depois de receber um pagamento, junto da imagem do recibo.",
    grupo: "Imagens e recibo",
    padrao: `{saudacao} 😊\n\nRecebi o seu pagamento de {valor}. Segue o recibo. {situacao}\n\nObrigada! 🙏`,
    variaveis: ["saudacao", "nome", "valor", "saldo", "situacao"],
    exemplo: { ...EX_PESSOA, valor: "R$ 1.000,00", saldo: "R$ 500,00", situacao: "Fica em aberto R$ 500,00." },
  },
  tabelaPrecos: {
    titulo: "Tabela de preços",
    quando: "Junto da arte da tabela de preços (+ > Tabela de preços e Funil).",
    grupo: "Imagens e recibo",
    padrao:
      `{saudacao}\n` +
      `Segue a nossa tabela de preços do HIPRO. ✨\n\n` +
      `Qualquer dúvida, estou à disposição para te ajudar a planejar o seu dia!`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  arteDivulgacao: {
    titulo: "Arte para a cliente divulgar",
    quando: "Junto da arte do dia do HIPRO (Agenda > reserva > Arte para divulgar).",
    grupo: "Imagens e recibo",
    padrao: `{saudacao} 😊\n\nPara ajudar a lotar a sua agenda do dia do HIPRO, preparei esta arte para você postar no status e no Instagram. Quanto mais pacientes agendados, melhor aproveitamos o dia!`,
    variaveis: ["saudacao", "nome"],
    exemplo: EX_PESSOA,
  },
  calculo: {
    titulo: "Imagem do cálculo",
    quando: "Quando o celular não compartilha a imagem do cálculo e abre a conversa no WhatsApp.",
    grupo: "Imagens e recibo",
    padrao: "Segue o cálculo dos disparos para conferência. 😊",
    variaveis: ["nome"],
    exemplo: { nome: "Dra. Simone" },
  },
};

export const IDS_MODELOS = Object.keys(MODELOS) as ModeloId[];

export type ModelosMensagem = Record<ModeloId, string>;

export const MODELOS_PADRAO: ModelosMensagem = Object.fromEntries(
  IDS_MODELOS.map((id) => [id, MODELOS[id].padrao])
) as ModelosMensagem;

const TOKEN = /\{([^{}]*)\}/g;

/**
 * Confere um texto para o modelo. Devolve a lista de problemas (vazia = ok),
 * em português, para a tela mostrar.
 */
export function problemasDoModelo(id: ModeloId, texto: string): string[] {
  const problemas: string[] = [];
  const def = MODELOS[id];
  if (!texto.trim()) return problemas; // vazio volta ao padrão, não é erro
  if (texto.length > TAMANHO_MAXIMO_MENSAGEM) problemas.push(`Passou de ${TAMANHO_MAXIMO_MENSAGEM} caracteres.`);
  const aceitas = new Set<string>(def.variaveis);
  const vistas = new Set<string>();
  for (const m of texto.matchAll(TOKEN)) {
    const nome = m[1];
    if (vistas.has(nome)) continue;
    vistas.add(nome);
    if (!(nome in VARIAVEIS)) problemas.push(`{${nome}} não existe.`);
    else if (!aceitas.has(nome)) problemas.push(`{${nome}} não serve nesta mensagem.`);
  }
  const sobra = texto.replace(TOKEN, "");
  if (/[{}]/.test(sobra)) problemas.push("Tem chave sem par: toda variável é {nome}, com as duas chaves.");
  return problemas;
}

/** Texto que vale para o modelo: o salvo, se servir; senão, o padrão. */
export function textoDoModelo(id: ModeloId, modelos?: Partial<ModelosMensagem> | null): string {
  const salvo = modelos?.[id];
  if (typeof salvo !== "string" || !salvo.trim()) return MODELOS[id].padrao;
  return problemasDoModelo(id, salvo).length ? MODELOS[id].padrao : salvo;
}

/**
 * Monta a mensagem. Variável sem valor some sem deixar buraco: o espaço
 * antes dela também sai quando depois vem espaço, pontuação ou fim de
 * linha ("em {cidade} nesses" vira "em nesses", nunca "em  nesses").
 */
export function renderizarModelo(
  id: ModeloId,
  valores: Partial<Record<VariavelId, string | null | undefined>>,
  modelos?: Partial<ModelosMensagem> | null
): string {
  const texto = textoDoModelo(id, modelos);
  let saida = "";
  let ultimo = 0;
  for (const m of texto.matchAll(TOKEN)) {
    const inicio = m.index ?? 0;
    saida += texto.slice(ultimo, inicio);
    ultimo = inicio + m[0].length;
    const valor = valores[m[1] as VariavelId] ?? "";
    if (valor) {
      saida += valor;
      continue;
    }
    const depois = texto.charAt(ultimo);
    if (saida.endsWith(" ") && (depois === "" || /[\s.,;:!?]/.test(depois))) saida = saida.slice(0, -1);
  }
  return saida + texto.slice(ultimo);
}

/** Prévia com os dados de exemplo do modelo. */
export function previaDoModelo(id: ModeloId, texto: string): string {
  return renderizarModelo(id, MODELOS[id].exemplo, { [id]: texto });
}

/**
 * Lê o que veio do banco: um texto por modelo; ausente, vazio, grande demais
 * ou com variável errada volta ao padrão.
 */
export function lerModelos(bruto: unknown): ModelosMensagem {
  const r = bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const saida = { ...MODELOS_PADRAO };
  for (const id of IDS_MODELOS) {
    const v = r[id];
    if (typeof v !== "string") continue;
    const t = v.replace(/\r\n?/g, "\n").trim();
    if (t && problemasDoModelo(id, t).length === 0) saida[id] = t;
  }
  return saida;
}

/** Só os modelos que diferem do padrão (o que vai para o banco). */
export function modelosDiferentes(m: ModelosMensagem): Partial<ModelosMensagem> {
  const saida: Partial<ModelosMensagem> = {};
  for (const id of IDS_MODELOS) if (m[id] !== MODELOS_PADRAO[id]) saida[id] = m[id];
  return saida;
}

// ---------- mensagens montadas em componentes (puras, para teste) ----------

/** Mensagem que vai com a imagem do recibo. `reais` formata o valor. */
export function mensagemRecibo(
  p: { saudacao: string; nome?: string; valorPago: number; saldo: number; reais: (n: number) => string },
  modelos?: Partial<ModelosMensagem> | null
): string {
  const situacao = p.saldo > 0.009 ? `Fica em aberto ${p.reais(p.saldo)}.` : "A locação está quitada.";
  return renderizarModelo(
    "recibo",
    { saudacao: p.saudacao, nome: p.nome, valor: p.reais(p.valorPago), saldo: p.reais(Math.max(0, p.saldo)), situacao },
    modelos
  );
}
