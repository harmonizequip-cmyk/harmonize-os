// Função "assistente" (Supabase Edge Function): a IA do Harmonize.
//
// Quem chama: a tela /assistente, com o login de quem está no app.
//   { "mensagem": "quem me deve?", "conversa_id": "<uuid opcional>", "cliente_id": "<uuid opcional>" }
// Responde { conversa_id, cliente_id, resposta, whatsapp, planilhas, agendas, gasto_mes_usd }.
// cliente_id amarra uma conversa nova a um cliente (histórico e memórias dele);
// whatsapp traz as mensagens prontas para o botão "Abrir no WhatsApp";
// planilhas traz a consulta e as colunas: a tela roda de novo na hora de
// baixar (dado sempre atual) e monta o .xlsx com o layout da Harmonize;
// agendas traz o período e uma mensagem por cliente: a tela gera a imagem das
// datas livres e mostra "Enviar com imagem" e "Marcar enviado" para cada uma.
//
// Roda com o login de quem pergunta (não usa service_role): a RLS de cada
// tabela vale para a IA igual vale para a tela. A IA lê o banco pela função
// assistente_consultar (só SELECT, transação só leitura) e guarda o que o
// dono ensina em assistente_memoria (geral ou por cliente). Mensagem de
// WhatsApp ela só prepara: quem envia é o dono. Nesta etapa não grava mais nada.
//
// Segredo: ANTHROPIC_API_KEY (Edge Functions > Secrets no painel do Supabase).
// Opcionais: ASSISTENTE_MODELO, ASSISTENTE_LIMITE_MENSAL_USD.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CONHECIMENTO, INSIGHTS } from "./conhecimento.ts";

const SITE = "https://harmonize-os.vercel.app";
const CORS = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELO = Deno.env.get("ASSISTENTE_MODELO") || "claude-sonnet-5-5";
const LIMITE_MENSAL_USD = Number(Deno.env.get("ASSISTENTE_LIMITE_MENSAL_USD") || "20");
const MAX_RODADAS = 10; // consultas por pergunta
const MAX_MENSAGENS_HISTORICO = 40;

// US$ por milhão de tokens (entrada, saída, leitura de cache, escrita de cache).
// Estimativa para o "gasto do mês" na tela; a conta oficial é a do console da Anthropic.
const PRECOS: Record<string, [number, number, number, number]> = {
  "claude-sonnet-5-5": [2, 10, 0.2, 2.5],
  "claude-opus-5-5": [5, 25, 0.5, 6.25],
  "claude-haiku-5-5": [1, 5, 0.1, 1.25],
};

type Bloco =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
type Mensagem = { role: "user" | "assistant"; content: string | Bloco[] };

const FERRAMENTAS = [
  {
    name: "consultar_banco",
    description:
      "Roda uma consulta SELECT (Postgres) no banco do Harmonize, com os direitos de quem está logado, e devolve as linhas em JSON (no máximo 200). Use para qualquer dado: agenda, clientes, locações, pagamentos, financeiro, tarefas, equipamentos.",
    input_schema: {
      type: "object",
      properties: {
        sql: { type: "string", description: "Uma consulta SELECT ou WITH, sem ponto e vírgula." },
        motivo: { type: "string", description: "Em poucas palavras, o que você quer descobrir." },
      },
      required: ["sql"],
    },
  },
  {
    name: "guardar_memoria",
    description:
      "Guarda algo que vale para as próximas conversas. Sem client_id: preferência geral do dono (jeito de escrever, como ele chama as coisas). Com client_id: fato, preferência ou combinado de uma cliente. Frase curta e clara.",
    input_schema: {
      type: "object",
      properties: {
        texto: { type: "string", description: "O que lembrar, em até 300 caracteres." },
        client_id: { type: "string", description: "id da cliente (clients.id), quando a memória é dela." },
      },
      required: ["texto"],
    },
  },
  {
    name: "vincular_cliente",
    description: "Amarra esta conversa a uma cliente (clients.id): o histórico e as memórias dela passam a vir junto.",
    input_schema: {
      type: "object",
      properties: { client_id: { type: "string" } },
      required: ["client_id"],
    },
  },
  {
    name: "gerar_planilha",
    description:
      "Prepara uma planilha (.xlsx com o layout da Harmonize) que o dono baixa com um toque. Use quando ele pedir planilha, lista para baixar ou exportar. A consulta pode trazer até 5000 linhas.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título da planilha, ex.: Clientes que estão devendo." },
        sql: { type: "string", description: "Uma consulta SELECT ou WITH, sem ponto e vírgula, já na ordem certa." },
        colunas: {
          type: "array",
          description: "Colunas na ordem de exibição.",
          items: {
            type: "object",
            properties: {
              campo: { type: "string", description: "Nome da coluna no resultado do SQL." },
              titulo: { type: "string", description: "Cabeçalho em português." },
              tipo: { type: "string", enum: ["texto", "moeda", "data", "inteiro"] },
              total: { type: "boolean", description: "Somar na linha de total (moeda ou inteiro)." },
            },
            required: ["campo", "titulo"],
          },
        },
        grafico: {
          type: "object",
          description: "Opcional: gráfico de barras (ranking) na aba Gráficos.",
          properties: {
            titulo: { type: "string" },
            categoria: { type: "string", description: "Campo do rótulo (ex.: cliente)." },
            valor: { type: "string", description: "Campo numérico (ex.: total)." },
            tipo: { type: "string", enum: ["moeda", "inteiro"] },
          },
          required: ["categoria", "valor"],
        },
      },
      required: ["titulo", "sql", "colunas"],
    },
  },
  {
    name: "preparar_envio_agenda",
    description:
      "Monta o cartão de envio da agenda (imagem das datas livres + mensagem) para várias clientes de uma vez. A tela gera a imagem e mostra, para cada cliente, os botões Enviar com imagem e Marcar enviado. Cada mensagem tem que ser diferente das outras do lote e das que a cliente já recebeu (consulte agenda_envios antes).",
    input_schema: {
      type: "object",
      properties: {
        inicio: { type: "string", description: "Primeiro dia do período (AAAA-MM-DD): dia 1 do mês na abertura, hoje na atualização." },
        fim: { type: "string", description: "Último dia do período (AAAA-MM-DD): o último dia do mês." },
        itens: {
          type: "array",
          description: "Uma entrada por cliente, no máximo 30.",
          items: {
            type: "object",
            properties: {
              client_id: { type: "string" },
              texto: { type: "string", description: "Mensagem que vai junto da imagem, única para esta cliente." },
            },
            required: ["client_id", "texto"],
          },
        },
      },
      required: ["inicio", "fim", "itens"],
    },
  },
  {
    name: "escolher_areas",
    description:
      "Mostra ao Eder a lista de áreas com caixinhas para ele marcar o que vai tratar (full face ou quando ele não disse as áreas). Use ANTES de preparar_planejamento quando as áreas não estiverem definidas. Ele marca e manda; aí você distribui.",
    input_schema: {
      type: "object",
      properties: {
        marcadas: {
          type: "array",
          description: "Áreas que já vêm marcadas (sugestão pela queixa).",
          items: { type: "string", enum: ["pescoco", "papada", "submandibular", "jowls", "arcomandibular", "temporal", "frontal", "perioral_sup", "perioral_inf", "terco_medio", "nasolabial", "olhos", "mento"] },
        },
        saldo_total: { type: "integer" },
        queixa: { type: "string" },
        paciente: { type: "string" },
      },
      required: ["marcadas"],
    },
  },
  {
    name: "preparar_planejamento",
    description:
      "Monta um planejamento do Planejador HIPRO (distribuição de disparos por área e profundidade) para um paciente. A tela mostra o resumo e o botão que abre o planejador já preenchido. Respeite o saldo e o protocolo do Eder (memórias 'Protocolo HIPRO').",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "Cliente (profissional) do atendimento, quando houver." },
        calendar_event_id: { type: "string", description: "Atendimento da agenda, quando houver." },
        paciente: { type: "string", description: "Nome do paciente (vazio se não souber)." },
        queixa: { type: "string", description: "Queixa principal." },
        saldo_total: { type: "integer", description: "Saldo total de disparos." },
        procedimento: { type: "string", description: "Ex.: HIPRO Full Face." },
        observacoes: { type: "string", description: "Observações clínicas / explicação da distribuição." },
        areas: {
          type: "array",
          description: "Áreas com disparos. Cada linha é uma profundidade.",
          items: {
            type: "object",
            properties: {
              id: { type: "string", enum: ["pescoco", "papada", "submandibular", "jowls", "arcomandibular", "temporal", "frontal", "perioral_sup", "perioral_inf"] },
              linhas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    prof: { type: "string", description: "Profundidade em mm, ex.: 4.5" },
                    direito: { type: "integer", description: "Bilateral: disparos do lado direito." },
                    esquerdo: { type: "integer", description: "Bilateral: disparos do lado esquerdo." },
                    disparos: { type: "integer", description: "Área única (papada): disparos." },
                  },
                  required: ["prof"],
                },
              },
            },
            required: ["id", "linhas"],
          },
        },
        papada_config: {
          type: "object",
          description: "Papada pelo adipômetro (o Eder informa). A função calcula as profundidades e divide os disparos; não mande linhas de papada em 'areas' quando usar isto.",
          properties: {
            adipometro_mm: { type: "number", description: "Medida do adipômetro em mm." },
            profundidades: { type: "integer", description: "Quantas profundidades (1 a 5)." },
            disparos: { type: "integer", description: "Disparos na papada." },
          },
          required: ["adipometro_mm", "profundidades", "disparos"],
        },
        areas_extras: {
          type: "array",
          description: "Áreas manuais (as que não são fixas no planejador): terço médio, nasolabial, áreas corporais...",
          items: {
            type: "object",
            properties: {
              nome: { type: "string" },
              regiao: { type: "string", enum: ["facial", "corporal"] },
              bilateral: { type: "boolean" },
              quadrantes: { type: "integer", description: "Corporal: quantos quadrantes de 10 x 10 cm (multiplica os disparos)." },
              linhas: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    prof: { type: "string" },
                    direito: { type: "integer" },
                    esquerdo: { type: "integer" },
                    disparos: { type: "integer", description: "Área única: disparos (no corporal, por quadrante)." },
                  },
                  required: ["prof"],
                },
              },
            },
            required: ["nome", "regiao", "bilateral", "linhas"],
          },
        },
      },
      required: ["saldo_total", "areas"],
    },
  },
  {
    name: "preparar_whatsapp",
    description:
      "Deixa uma mensagem pronta para o dono enviar no WhatsApp da cliente (aparece um botão Abrir no WhatsApp). Não envia nada sozinho.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "id da cliente (clients.id)." },
        texto: { type: "string", description: "A mensagem completa, pronta para enviar." },
      },
      required: ["client_id", "texto"],
    },
  },
  {
    name: "esquecer_memoria",
    description: "Apaga uma memória pelo id (listado nas memórias do sistema).",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
];

// Áreas fixas do Planejador HIPRO (public/ferramentas/planejador.html).
const PROF_STD = ["1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5"];
const PROF_PAP = [...PROF_STD, "6.0", "7.0", "8.0", "9.0", "10.0", "11.0", "12.0", "13.0"];
// Papada pelo adipômetro (espelha profundidadesPapada/dividirDisparos de lib/planejamento.ts).
const PROF_PAPADA = [4.5, 6, 7, 8, 9, 10, 11, 12, 13];
function profundidadesPapada(adip: number, quantidade: number): number[] {
  const cabem = PROF_PAPADA.filter((p) => p <= adip / 2);
  const max = cabem.length ? cabem[cabem.length - 1] : 4.5;
  const cands = PROF_PAPADA.filter((p) => p <= max);
  const n = Math.max(1, Math.min(5, Math.round(quantidade) || 1, cands.length));
  if (n === 1) return [max];
  const escolhidas = new Set<number>([4.5, max]);
  for (let i = 1; i < n - 1; i++) {
    const alvo = 4.5 + ((max - 4.5) * i) / (n - 1);
    const livre = cands.filter((p) => !escolhidas.has(p)).sort((a, b) => Math.abs(a - alvo) - Math.abs(b - alvo))[0];
    if (livre !== undefined) escolhidas.add(livre);
  }
  return Array.from(escolhidas).sort((a, b) => b - a);
}
function dividirDisparos(total: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.floor(total / partes / 10) * 10;
  const r = Array(partes).fill(base);
  r[0] += Math.max(0, Math.round(total) - base * partes);
  return r;
}

// Máximo da tabela do fabricante por lado e por profundidade (papada, campo
// único, aceita a soma dos dois lados). Jowls pode passar (palavra do dono).
const MAXIMO_POR_LINHA: Record<string, number | null> = {
  pescoco: 1200,
  papada: 2400,
  submandibular: 1200,
  jowls: null,
  arcomandibular: 1200,
  temporal: 1200,
  frontal: 500,
  perioral_sup: 600,
  perioral_inf: 600,
};
const AREAS_PLANEJADOR: Record<string, { nome: string; bilateral: boolean; profs: string[] }> = {
  pescoco: { nome: "Pescoço", bilateral: true, profs: PROF_STD },
  papada: { nome: "Papada", bilateral: false, profs: PROF_PAP },
  submandibular: { nome: "Submandibular", bilateral: true, profs: PROF_STD },
  jowls: { nome: "Jowls", bilateral: true, profs: PROF_STD },
  arcomandibular: { nome: "Arco Mandibular", bilateral: true, profs: PROF_STD },
  temporal: { nome: "Temporal e Arco Zigomático", bilateral: true, profs: PROF_STD },
  frontal: { nome: "Frontal", bilateral: true, profs: PROF_STD },
  perioral_sup: { nome: "Perioral Superior", bilateral: true, profs: PROF_STD },
  perioral_inf: { nome: "Perioral Inferior", bilateral: true, profs: PROF_STD },
};

// Nome do procedimento pelas áreas (espelha nomeProcedimento de lib/planejamento.ts):
// todas as áreas grandes do rosto = Full Face; papada, pescoço e submandibular somam no nome.
const ROSTO_GRANDES = ["frontal", "temporal", "terco_medio", "nasolabial", "jowls", "arcomandibular"];
const FORA_DO_ROSTO: [string, string][] = [["submandibular", "Submandibular"], ["papada", "Papada"], ["pescoco", "Pescoço"]];
const ID_POR_NOME: Record<string, string> = { "terco medio": "terco_medio", nasolabial: "nasolabial", mento: "mento", olhos: "olhos" };
function nomeDoProcedimento(ids: Set<string>, nomes: string[]): string {
  if (ROSTO_GRANDES.every((id) => ids.has(id))) return ["Full Face", ...FORA_DO_ROSTO.filter(([id]) => ids.has(id)).map(([, n]) => n)].join(" + ");
  return nomes.join(" + ");
}

// Modo Cérebro: só lê o banco e grava insights.
const CATEGORIAS = ["prospeccao", "relacionamento", "vendas", "financeiro", "agenda", "marketing", "operacao"];
const FERRAMENTAS_INSIGHTS = [
  FERRAMENTAS[0],
  {
    name: "registrar_insights",
    description: "Grava os insights da rodada (de 8 a 12) na tela Cérebro. Uma chamada com todos.",
    input_schema: {
      type: "object",
      properties: {
        itens: {
          type: "array",
          items: {
            type: "object",
            properties: {
              categoria: { type: "string", enum: CATEGORIAS },
              titulo: { type: "string", description: "Frase forte e específica, até 160 caracteres." },
              texto: { type: "string", description: "O que os dados mostram e por que importa (2 a 4 frases)." },
              acao: { type: "string", description: "Próximo passo concreto para esta semana, com mensagem pronta quando for abordagem." },
              evidencia: { type: "string", description: "Números exatos que sustentam, ou 'ideia de mercado, sem dado próprio'." },
              impacto: { type: "integer", enum: [1, 2, 3] },
              client_ids: { type: "array", items: { type: "string" }, description: "Clientes envolvidas (clients.id), até 15." },
            },
            required: ["categoria", "titulo", "texto", "acao", "impacto"],
          },
        },
      },
      required: ["itens"],
    },
  },
];
const FOCOS: Record<string, string> = {
  prospeccao: "Foque em prospecção: como achar e converter clientes novas.",
  relacionamento: "Foque em relacionamento: reativação, fidelização, indicação.",
  vendas: "Foque em vendas: ticket, pacotes, conversão do funil.",
  financeiro: "Foque no financeiro: lucro, custos, recebimento, caixa.",
  agenda: "Foque na agenda: ocupação, dias vazios, rotas, cancelamentos.",
  marketing: "Foque em marketing: conteúdo, posicionamento, eventos, parcerias.",
  operacao: "Foque em operação: deslocamento, equipamentos, rotina do Eder.",
};

function json(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());
}

function inicioDoMesIso(): string {
  const [ano, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .split("-");
  return `${ano}-${mes}-01T00:00:00-03:00`;
}

/**
 * Tira o raciocínio interno (blocos "thinking") das respostas antigas. Ele fica
 * preso ao texto do sistema da pergunta em que nasceu (que tem a hora), e a API
 * recusa a conversa se ele voltar numa pergunta seguinte. Dentro da mesma
 * pergunta (rodadas de consulta) ele continua, porque o sistema é o mesmo.
 */
function semRaciocinio(msgs: Mensagem[]): Mensagem[] {
  const saida: Mensagem[] = [];
  for (const m of msgs) {
    if (m.role !== "assistant" || !Array.isArray(m.content)) {
      saida.push(m);
      continue;
    }
    const blocos = m.content.filter((b) => {
      const t = (b as { type: string }).type;
      return t !== "thinking" && t !== "redacted_thinking";
    });
    saida.push({ role: "assistant", content: blocos.length ? blocos : [{ type: "text", text: "(sem texto)" }] });
  }
  return saida;
}

/** Corta o histórico mantendo o começo numa pergunta de texto (nunca num resultado de ferramenta solto). */
function recortarHistorico(msgs: Mensagem[]): Mensagem[] {
  if (msgs.length <= MAX_MENSAGENS_HISTORICO) return msgs;
  let i = msgs.length - MAX_MENSAGENS_HISTORICO;
  while (i < msgs.length && !(msgs[i].role === "user" && typeof msgs[i].content === "string")) i++;
  return msgs.slice(i);
}

/** Cópia das mensagens com marca de cache na última, para as rodadas seguintes saírem baratas. */
function comCacheNoFim(msgs: Mensagem[]): unknown[] {
  return msgs.map((m, i) => {
    if (i !== msgs.length - 1) return m;
    const blocos: Bloco[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content;
    return {
      role: m.role,
      content: blocos.map((b, j) => (j === blocos.length - 1 ? { ...b, cache_control: { type: "ephemeral" } } : b)),
    };
  });
}

type Whats = { client_id: string; nome: string; telefone: string; texto: string };
type ColunaPedida = { campo: string; titulo: string; tipo?: string; total?: boolean };
type Planilha = {
  titulo: string;
  sql: string;
  colunas: ColunaPedida[];
  grafico?: { titulo?: string; categoria: string; valor: string; tipo?: string };
  linhas: number;
};
type ItemAgenda = { client_id: string; nome: string; telefone: string; texto: string; ultimo_envio: string | null };
type Agenda = { inicio: string; fim: string; itens: ItemAgenda[] };
type PlanejamentoIA = {
  client_id: string | null;
  calendar_event_id: string | null;
  cliente_nome: string | null;
  paciente: string;
  saldo: number;
  total: number;
  resumo: { area: string; total: number }[];
  estado: Record<string, unknown>;
};
type Estado = {
  clienteId: string | null;
  whatsapp: Whats[];
  planilhas: Planilha[];
  agendas: Agenda[];
  insights: number;
  planejamentos: PlanejamentoIA[];
  escolhas: { marcadas: string[]; saldo: number | null; queixa: string | null; paciente: string | null }[];
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function executarFerramenta(
  supabase: SupabaseClient,
  userId: string,
  nome: string,
  entrada: Record<string, unknown>,
  estado: Estado
): Promise<{ texto: string; erro: boolean }> {
  try {
    if (nome === "consultar_banco") {
      const { data, error } = await supabase.rpc("assistente_consultar", { p_sql: String(entrada.sql ?? "") });
      if (error) return { texto: `Erro na consulta: ${error.message}`, erro: true };
      const linhas = Array.isArray(data) ? data : [];
      let texto = JSON.stringify(linhas.slice(0, 200));
      if (linhas.length > 200) texto += "\n(Mais de 200 linhas: agregue ou filtre melhor.)";
      if (texto.length > 20000) texto = texto.slice(0, 20000) + "\n(Resultado cortado: agregue ou filtre melhor.)";
      return { texto, erro: false };
    }
    if (nome === "guardar_memoria") {
      const texto = String(entrada.texto ?? "").trim().slice(0, 500);
      if (!texto) return { texto: "Texto vazio.", erro: true };
      const clientId = entrada.client_id ? String(entrada.client_id) : null;
      if (clientId && !UUID.test(clientId)) return { texto: "client_id inválido.", erro: true };
      const { error } = await supabase.from("assistente_memoria").insert({ texto, user_id: userId, client_id: clientId });
      if (error) return { texto: `Não guardei: ${error.message}`, erro: true };
      return { texto: clientId ? "Guardado na memória da cliente." : "Guardado.", erro: false };
    }
    if (nome === "gerar_planilha") {
      const sql = String(entrada.sql ?? "");
      const titulo = String(entrada.titulo ?? "Planilha").slice(0, 80);
      const colunas = (Array.isArray(entrada.colunas) ? entrada.colunas : []) as ColunaPedida[];
      if (!colunas.length) return { texto: "Faltaram as colunas.", erro: true };
      const { data, error } = await supabase.rpc("assistente_consultar", { p_sql: sql, p_limite: 5000 });
      if (error) return { texto: `Erro na consulta: ${error.message}`, erro: true };
      const linhas = Array.isArray(data) ? data : [];
      const faltando = colunas.filter((c) => linhas.length && !(c.campo in linhas[0])).map((c) => c.campo);
      if (faltando.length) return { texto: `Campos que o SQL não trouxe: ${faltando.join(", ")}.`, erro: true };
      const grafico = entrada.grafico as Planilha["grafico"] | undefined;
      estado.planilhas.push({ titulo, sql, colunas, ...(grafico?.categoria && grafico?.valor ? { grafico } : {}), linhas: Math.min(linhas.length, 5000) });
      return {
        texto: JSON.stringify({
          ok: true,
          linhas: Math.min(linhas.length, 5000),
          cortada: linhas.length > 5000,
          amostra: linhas.slice(0, 5),
        }),
        erro: false,
      };
    }
    if (nome === "escolher_areas") {
      const validas = ["pescoco", "papada", "submandibular", "jowls", "arcomandibular", "temporal", "frontal", "perioral_sup", "perioral_inf", "terco_medio", "nasolabial", "olhos", "mento"];
      const marcadas = (Array.isArray(entrada.marcadas) ? entrada.marcadas : []).map(String).filter((x) => validas.includes(x));
      estado.escolhas.push({
        marcadas,
        saldo: Math.max(0, Math.round(Number(entrada.saldo_total) || 0)) || null,
        queixa: entrada.queixa ? String(entrada.queixa).slice(0, 200) : null,
        paciente: entrada.paciente ? String(entrada.paciente).slice(0, 120) : null,
      });
      return { texto: JSON.stringify({ ok: true, marcadas }), erro: false };
    }
    if (nome === "preparar_planejamento") {
      const saldo = Math.max(0, Math.round(Number(entrada.saldo_total) || 0));
      const areas = (Array.isArray(entrada.areas) ? entrada.areas : []) as { id?: string; linhas?: Record<string, unknown>[] }[];
      const DATA: Record<string, unknown[]> = {};
      const resumo: { area: string; total: number }[] = [];
      const problemas: string[] = [];
      let total = 0;
      // Papada pelo adipômetro: a conta é fixa, não fica a cargo da IA.
      const pc = entrada.papada_config as { adipometro_mm?: number; profundidades?: number; disparos?: number } | undefined;
      let papadaCalculada = false;
      if (pc && Number(pc.adipometro_mm) > 0 && Number(pc.disparos) > 0) {
        const profs = profundidadesPapada(Number(pc.adipometro_mm), Number(pc.profundidades) || 1);
        const partes = dividirDisparos(Number(pc.disparos), profs.length);
        DATA.papada = profs.map((p, i) => ({ prof: p.toFixed(1), disp: partes[i] }));
        const tot = partes.reduce((x, y) => x + y, 0);
        resumo.push({ area: "Papada", total: tot });
        total += tot;
        papadaCalculada = true;
      }
      for (const a of areas) {
        if (papadaCalculada && String(a.id) === "papada") continue;
        const def = AREAS_PLANEJADOR[String(a.id)];
        if (!def) {
          problemas.push(`área desconhecida: ${a.id}`);
          continue;
        }
        const linhas: unknown[] = [];
        let totArea = 0;
        for (const l of Array.isArray(a.linhas) ? a.linhas : []) {
          const prof = Number(l.prof).toFixed(1);
          if (!def.profs.includes(prof)) {
            problemas.push(`${def.nome}: profundidade ${l.prof} mm não existe`);
            continue;
          }
          const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
          const teto = MAXIMO_POR_LINHA[String(a.id)];
          if (def.bilateral) {
            const d = n(l.direito ?? l.disparos);
            const e = n(l.esquerdo ?? l.disparos);
            if (teto && (d > teto || e > teto)) problemas.push(`${def.nome} ${prof} mm passa do máximo de ${teto} por lado`);
            linhas.push({ prof, dispD: d, dispE: e });
            totArea += d + e;
          } else {
            const d = n(l.disparos ?? (n(l.direito) + n(l.esquerdo)));
            if (teto && d > teto) problemas.push(`${def.nome} ${prof} mm passa do máximo de ${teto}`);
            linhas.push({ prof, disp: d });
            totArea += d;
          }
        }
        if (linhas.length) {
          DATA[String(a.id)] = linhas;
          resumo.push({ area: def.nome, total: totArea });
          total += totArea;
        }
      }
      // Áreas manuais, no mesmo formato do botão "Adicionar área manual".
      const customAreas: Record<string, unknown>[] = [];
      for (const x of (Array.isArray(entrada.areas_extras) ? entrada.areas_extras : []) as Record<string, unknown>[]) {
        const nomeArea = String(x.nome ?? "").trim().slice(0, 60);
        if (!nomeArea) continue;
        const corporal = x.regiao === "corporal";
        const bilateral = !!x.bilateral;
        const quad = corporal ? Math.max(1, Math.round(Number(x.quadrantes) || 1)) : 1;
        const id = `custom_${customAreas.length + 1}`;
        const linhas: unknown[] = [];
        let totArea = 0;
        for (const l of (Array.isArray(x.linhas) ? x.linhas : []) as Record<string, unknown>[]) {
          const prof = Number(l.prof).toFixed(1);
          if (!PROF_PAP.includes(prof)) {
            problemas.push(`${nomeArea}: profundidade ${l.prof} mm não existe`);
            continue;
          }
          const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
          const base: Record<string, unknown> = bilateral
            ? { prof, dispD: n(l.direito ?? l.disparos), dispE: n(l.esquerdo ?? l.disparos) }
            : { prof, disp: n(l.disparos ?? (n(l.direito) + n(l.esquerdo))) };
          if (corporal) base.quad = quad;
          const soma = bilateral ? (base.dispD as number) + (base.dispE as number) : (base.disp as number);
          totArea += soma * quad;
          linhas.push(base);
        }
        if (!linhas.length) continue;
        customAreas.push({ id, nome: nomeArea, bilateral, opts: PROF_PAP, regiao: corporal ? "corporal" : "facial" });
        DATA[id] = linhas;
        resumo.push({ area: nomeArea, total: totArea });
        total += totArea;
      }
      if (problemas.length) return { texto: `Corrija e chame de novo: ${problemas.join("; ")}.`, erro: true };
      if (!total) return { texto: "Nenhum disparo distribuído.", erro: true };
      if (saldo && total > saldo) return { texto: `Distribuiu ${total} disparos, acima do saldo de ${saldo}. Ajuste.`, erro: true };
      let clienteNome: string | null = null;
      const clientId = entrada.client_id && UUID.test(String(entrada.client_id)) ? String(entrada.client_id) : null;
      if (clientId) {
        const { data: c } = await supabase.from("clients").select("name, display_name, treatment").eq("id", clientId).maybeSingle();
        if (c) clienteNome = [c.treatment, c.display_name || c.name].filter(Boolean).join(" ");
      }
      const eventId = entrada.calendar_event_id && UUID.test(String(entrada.calendar_event_id)) ? String(entrada.calendar_event_id) : null;
      let data = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
      if (eventId) {
        const { data: ev } = await supabase.from("calendar_events").select("date_start").eq("id", eventId).maybeSingle();
        if (ev?.date_start) data = ev.date_start;
      }
      const txt = (v: unknown, max = 2000) => String(v ?? "").trim().slice(0, max);
      const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const idsUsados = new Set<string>(Object.keys(DATA).filter((k) => !k.startsWith("custom_")));
      for (const c of customAreas) {
        const nomeC = semAcento(String(c.nome));
        const achado = Object.keys(ID_POR_NOME).find((k) => nomeC.includes(k)) ?? (nomeC.includes("palpebr") ? "olhos" : null);
        if (achado) idsUsados.add(ID_POR_NOME[achado] ?? achado);
      }
      const procedimento = txt(entrada.procedimento, 120) || nomeDoProcedimento(idsUsados, resumo.map((r) => r.area));
      const estadoPlano: Record<string, unknown> = {
        paciente: txt(entrada.paciente, 120),
        data,
        queixa: txt(entrada.queixa, 300),
        profissional: clienteNome ?? "",
        procNome: procedimento,
        saldoTotal: String(saldo || total),
        obs: txt(entrada.observacoes),
        DATA,
        customAreas,
        customSeq: customAreas.length,
      };
      const plano: PlanejamentoIA = {
        client_id: clientId,
        calendar_event_id: eventId,
        cliente_nome: clienteNome,
        paciente: txt(entrada.paciente, 120),
        saldo: saldo || total,
        total,
        resumo,
        estado: estadoPlano,
      };
      estado.planejamentos.push(plano);
      // O plano inteiro vai no resultado para a tela remontar o cartão ao reabrir a conversa.
      return { texto: JSON.stringify({ ok: true, ...plano }), erro: false };
    }
    if (nome === "registrar_insights") {
      const itens = (Array.isArray(entrada.itens) ? entrada.itens : []).slice(0, 15) as Record<string, unknown>[];
      const linhas = itens
        .map((i) => ({
          user_id: userId,
          categoria: CATEGORIAS.includes(String(i.categoria)) ? String(i.categoria) : "operacao",
          titulo: String(i.titulo ?? "").trim().slice(0, 160),
          texto: String(i.texto ?? "").trim().slice(0, 1500),
          acao: i.acao ? String(i.acao).trim().slice(0, 1200) : null,
          evidencia: i.evidencia ? String(i.evidencia).trim().slice(0, 800) : null,
          impacto: [1, 2, 3].includes(Number(i.impacto)) ? Number(i.impacto) : 2,
          client_ids: (Array.isArray(i.client_ids) ? i.client_ids : []).map(String).filter((id) => UUID.test(id)).slice(0, 15),
        }))
        .filter((l) => l.titulo && l.texto);
      if (!linhas.length) return { texto: "Nenhum insight válido.", erro: true };
      const { error } = await supabase.from("insights").insert(linhas);
      if (error) return { texto: `Não gravei: ${error.message}`, erro: true };
      estado.insights += linhas.length;
      return { texto: `Gravados ${linhas.length} insights.`, erro: false };
    }
    if (nome === "preparar_envio_agenda") {
      const inicio = String(entrada.inicio ?? "");
      const fim = String(entrada.fim ?? "");
      if (!DATA.test(inicio) || !DATA.test(fim) || fim < inicio) return { texto: "Período inválido (use AAAA-MM-DD).", erro: true };
      const pedidos = (Array.isArray(entrada.itens) ? entrada.itens : []).slice(0, 30) as { client_id?: string; texto?: string }[];
      const ids = pedidos.map((i) => String(i.client_id ?? "")).filter((id) => UUID.test(id));
      if (!ids.length) return { texto: "Nenhuma cliente válida.", erro: true };
      const [{ data: clientes }, { data: envios }] = await Promise.all([
        supabase.from("clients").select("id, name, display_name, treatment, whatsapp").in("id", ids),
        supabase.from("agenda_envios").select("client_id, enviado_em").in("client_id", ids).order("enviado_em", { ascending: false }),
      ]);
      const ultimo = new Map<string, string>();
      for (const e of envios ?? []) if (!ultimo.has(e.client_id)) ultimo.set(e.client_id, e.enviado_em);
      const porId = new Map((clientes ?? []).map((c) => [c.id, c]));
      const itens: ItemAgenda[] = [];
      const semWhats: string[] = [];
      const vistos = new Set<string>();
      for (const p of pedidos) {
        const c = porId.get(String(p.client_id ?? ""));
        const texto = String(p.texto ?? "").trim();
        if (!c || !texto || vistos.has(c.id)) continue;
        vistos.add(c.id);
        const nomeC = [c.treatment, c.display_name || c.name].filter(Boolean).join(" ");
        if (!c.whatsapp) {
          semWhats.push(nomeC);
          continue;
        }
        itens.push({ client_id: c.id, nome: nomeC, telefone: c.whatsapp, texto, ultimo_envio: ultimo.get(c.id) ?? null });
      }
      // Duas mensagens iguais no mesmo lote denunciam envio em massa.
      const textos = new Set<string>();
      for (const i of itens) {
        const k = i.texto.toLowerCase().replace(/\s+/g, " ");
        if (textos.has(k)) return { texto: `A mensagem de ${i.nome} repete a de outra cliente. Reescreva diferente.`, erro: true };
        textos.add(k);
      }
      if (!itens.length) return { texto: `Nenhuma cliente com WhatsApp. Sem WhatsApp: ${semWhats.join(", ") || "-"}.`, erro: true };
      estado.agendas.push({ inicio, fim, itens });
      return {
        texto: JSON.stringify({
          ok: true,
          inicio,
          fim,
          itens: itens.map((i) => ({ client_id: i.client_id, nome: i.nome, telefone: i.telefone, ultimo_envio: i.ultimo_envio })),
          sem_whatsapp: semWhats,
        }),
        erro: false,
      };
    }
    if (nome === "vincular_cliente" || nome === "preparar_whatsapp") {
      const clientId = String(entrada.client_id ?? "");
      if (!UUID.test(clientId)) return { texto: "client_id inválido.", erro: true };
      const { data: c, error } = await supabase
        .from("clients")
        .select("id, name, display_name, treatment, whatsapp")
        .eq("id", clientId)
        .maybeSingle();
      if (error || !c) return { texto: "Cliente não encontrada.", erro: true };
      const nomeCliente = [c.treatment, c.display_name || c.name].filter(Boolean).join(" ");
      if (nome === "vincular_cliente") {
        estado.clienteId = c.id;
        return { texto: `Conversa amarrada a ${nomeCliente}.`, erro: false };
      }
      const texto = String(entrada.texto ?? "").trim();
      if (!texto) return { texto: "Mensagem vazia.", erro: true };
      if (!c.whatsapp) return { texto: `${nomeCliente} não tem WhatsApp no cadastro. Mostre o texto para ele copiar.`, erro: true };
      estado.whatsapp.push({ client_id: c.id, nome: nomeCliente, telefone: c.whatsapp, texto });
      if (!estado.clienteId) estado.clienteId = c.id;
      // O telefone fica no resultado para a tela remontar o botão ao reabrir a conversa.
      return { texto: JSON.stringify({ ok: true, nome: nomeCliente, telefone: c.whatsapp }), erro: false };
    }
    if (nome === "esquecer_memoria") {
      const { error } = await supabase.from("assistente_memoria").delete().eq("id", String(entrada.id ?? ""));
      if (error) return { texto: `Não apaguei: ${error.message}`, erro: true };
      return { texto: "Apagado.", erro: false };
    }
    return { texto: `Ferramenta desconhecida: ${nome}`, erro: true };
  } catch (e) {
    return { texto: `Falhou: ${(e as Error).message}`, erro: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);

  const chave = Deno.env.get("ANTHROPIC_API_KEY");
  if (!chave) return json({ erro: "A chave da IA ainda não foi colocada no Supabase (segredo ANTHROPIC_API_KEY)." }, 503);

  const auth = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });

  const { data: usuario } = await supabase.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  const userId = usuario?.user?.id;
  if (!userId) return json({ erro: "Entre no Harmonize de novo." }, 401);

  const { data: perfil } = await supabase
    .from("profiles")
    .select("name, active, somente_leitura")
    .eq("id", userId)
    .maybeSingle();
  if (!perfil?.active || perfil.somente_leitura) return json({ erro: "Seu acesso não inclui o assistente." }, 403);

  let corpo: { mensagem?: string; conversa_id?: string | null; cliente_id?: string | null; modo?: string; foco?: string };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }
  const modoInsights = corpo.modo === "insights";
  const pergunta = modoInsights
    ? `Gere uma nova rodada de insights para a Harmonize. ${FOCOS[String(corpo.foco)] ?? "Olhe tudo, de forma ampla."}`
    : String(corpo.mensagem ?? "").trim().slice(0, 4000);
  if (!pergunta) return json({ erro: "Escreva ou fale a pergunta." }, 400);

  // Trava de gasto do mês (além do limite que fica no console da Anthropic).
  const { data: usoMes } = await supabase
    .from("assistente_uso")
    .select("custo_usd")
    .eq("user_id", userId)
    .gte("created_at", inicioDoMesIso());
  const gastoAntes = (usoMes ?? []).reduce((s, u) => s + Number(u.custo_usd), 0);
  if (gastoAntes >= LIMITE_MENSAL_USD) {
    return json(
      { erro: `O assistente chegou ao limite do mês (US$ ${LIMITE_MENSAL_USD.toFixed(2)}). Volta no dia 1º ou aumente o limite.` },
      429
    );
  }

  // Conversa: continua a anterior ou começa uma nova.
  let conversaId = modoInsights ? null : corpo.conversa_id || null;
  let historico: Mensagem[] = [];
  const estado: Estado = { clienteId: corpo.cliente_id && UUID.test(corpo.cliente_id) ? corpo.cliente_id : null, whatsapp: [], planilhas: [], agendas: [], insights: 0, planejamentos: [], escolhas: [] };
  if (conversaId) {
    const { data: conv } = await supabase
      .from("assistente_conversas")
      .select("mensagens, client_id")
      .eq("id", conversaId)
      .maybeSingle();
    if (conv) {
      historico = semRaciocinio((conv.mensagens as Mensagem[]) ?? []);
      estado.clienteId = conv.client_id ?? estado.clienteId;
    } else conversaId = null;
  }
  const clienteInicial = estado.clienteId;

  const { data: memorias } = await supabase
    .from("assistente_memoria")
    .select("id, texto")
    .is("client_id", null)
    .order("created_at", { ascending: true })
    .limit(100);

  let blocoCliente = "";
  if (estado.clienteId) {
    const [{ data: c }, { data: memCliente }] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, display_name, treatment, clinic_name, city, state, whatsapp, parceiro, stage, notes")
        .eq("id", estado.clienteId)
        .maybeSingle(),
      supabase
        .from("assistente_memoria")
        .select("id, texto, created_at")
        .eq("client_id", estado.clienteId)
        .order("created_at", { ascending: true })
        .limit(100),
    ]);
    if (c) {
      blocoCliente =
        `\n\nEsta conversa é sobre a cliente ${[c.treatment, c.display_name || c.name].filter(Boolean).join(" ")} ` +
        `(client_id ${c.id}; cadastro: ${c.name}${c.clinic_name ? `, clínica ${c.clinic_name}` : ""}${c.city ? `, ${c.city}${c.state ? "/" + c.state : ""}` : ""}` +
        `${c.parceiro ? ", PARCEIRA (não paga taxa de reserva)" : ""}, etapa ${c.stage}${c.whatsapp ? ", tem WhatsApp" : ", sem WhatsApp no cadastro"}).` +
        (c.notes ? `\nObservações do cadastro: ${String(c.notes).slice(0, 800)}` : "") +
        (memCliente?.length
          ? `\nMemórias desta cliente:\n${memCliente.map((m) => `- [${m.id}] ${m.texto}`).join("\n")}`
          : "\nMemórias desta cliente: nenhuma ainda.") +
        "\nPara responder sobre ela, consulte o que precisar (reservas, locações, pagamentos, tarefas).";
    }
  }

  const contexto =
    `Agora: ${hojeSaoPaulo()} (horário de Brasília). Quem pergunta: ${perfil.name}.\n` +
    (memorias?.length
      ? `Memórias gerais (o que ele já te ensinou; siga sempre):\n${memorias.map((m) => `- [${m.id}] ${m.texto}`).join("\n")}`
      : "Memórias gerais: nenhuma ainda.") +
    blocoCliente;

  const mensagens: Mensagem[] = [...historico, { role: "user", content: pergunta }];
  const enviar = () => recortarHistorico(mensagens);

  const uso = { entrada: 0, saida: 0, cacheLeitura: 0, cacheEscrita: 0 };
  let resposta = "";

  const maxRodadas = modoInsights ? 11 : MAX_RODADAS;
  for (let rodada = 0; rodada <= maxRodadas; rodada++) {
    const ultimaRodada = rodada === maxRodadas;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 8000,
        system: [
          { type: "text", text: CONHECIMENTO, cache_control: { type: "ephemeral" } },
          ...(modoInsights ? [{ type: "text", text: INSIGHTS }] : []),
          { type: "text", text: contexto },
        ],
        tools: modoInsights ? FERRAMENTAS_INSIGHTS : FERRAMENTAS,
        // Na última rodada, sem ferramentas: responde com o que já tem.
        ...(ultimaRodada ? { tool_choice: { type: "none" } } : {}),
        messages: comCacheNoFim(enviar()),
      }),
    });
    if (!r.ok) {
      const txt = await r.text();
      console.error("anthropic", r.status, txt);
      const msg =
        r.status === 401
          ? "A chave da IA não foi aceita. Confira o segredo ANTHROPIC_API_KEY."
          : r.status === 429 || r.status === 529
          ? "A IA está ocupada agora. Tente de novo em instantes."
          : /credit|billing|balance/i.test(txt)
          ? "Acabou o crédito da conta da IA (console da Anthropic)."
          : "A IA não respondeu. Tente de novo.";
      return json({ erro: msg }, 502);
    }
    const dados = await r.json();
    uso.entrada += dados.usage?.input_tokens ?? 0;
    uso.saida += dados.usage?.output_tokens ?? 0;
    uso.cacheLeitura += dados.usage?.cache_read_input_tokens ?? 0;
    uso.cacheEscrita += dados.usage?.cache_creation_input_tokens ?? 0;

    const blocos = (dados.content ?? []) as Bloco[];
    mensagens.push({ role: "assistant", content: blocos });

    const usos = blocos.filter((b): b is Extract<Bloco, { type: "tool_use" }> => b.type === "tool_use");
    if (dados.stop_reason !== "tool_use" || usos.length === 0) {
      resposta = blocos
        .filter((b): b is Extract<Bloco, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (dados.stop_reason === "refusal") resposta ||= "Não posso ajudar com isso.";
      break;
    }

    const resultados: Bloco[] = [];
    for (const u of usos) {
      const res = await executarFerramenta(supabase, userId, u.name, u.input ?? {}, estado);
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: res.texto, ...(res.erro ? { is_error: true } : {}) });
    }
    mensagens.push({ role: "user", content: resultados });
  }

  if (!resposta) resposta = "Não consegui fechar a resposta. Tente perguntar de outro jeito.";

  const [pe, ps, pcl, pce] = PRECOS[MODELO] ?? PRECOS["claude-sonnet-5-5"];
  const custo = (uso.entrada * pe + uso.saida * ps + uso.cacheLeitura * pcl + uso.cacheEscrita * pce) / 1_000_000;

  // Guarda a conversa inteira (inclusive as consultas, para a IA lembrar do contexto).
  // A rodada do Cérebro não vira conversa: o resultado fica na tabela insights.
  if (modoInsights) {
    // nada a guardar
  } else if (conversaId) {
    await supabase
      .from("assistente_conversas")
      .update({ mensagens: semRaciocinio(mensagens), client_id: estado.clienteId, updated_at: new Date().toISOString() })
      .eq("id", conversaId);
  } else {
    const titulo = pergunta.length > 60 ? pergunta.slice(0, 57) + "..." : pergunta;
    const { data: nova } = await supabase
      .from("assistente_conversas")
      .insert({ user_id: userId, client_id: estado.clienteId, titulo, mensagens: semRaciocinio(mensagens) })
      .select("id")
      .single();
    conversaId = nova?.id ?? null;
  }

  await supabase.from("assistente_uso").insert({
    user_id: userId,
    conversa_id: conversaId,
    modelo: MODELO,
    tokens_entrada: uso.entrada,
    tokens_saida: uso.saida,
    tokens_cache_leitura: uso.cacheLeitura,
    tokens_cache_escrita: uso.cacheEscrita,
    custo_usd: Math.round(custo * 100000) / 100000,
  });

  return json({
    conversa_id: conversaId,
    cliente_id: estado.clienteId,
    cliente_mudou: estado.clienteId !== clienteInicial,
    resposta,
    whatsapp: estado.whatsapp,
    planilhas: estado.planilhas,
    agendas: estado.agendas,
    insights_criados: estado.insights,
    planejamentos: estado.planejamentos,
    escolhas_areas: estado.escolhas,
    gasto_mes_usd: Math.round((gastoAntes + custo) * 100) / 100,
  });
});
