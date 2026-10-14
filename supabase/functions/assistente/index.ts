// Função "assistente" (Supabase Edge Function): a IA do Harmonize.
//
// Quem chama: a tela /assistente, com o login de quem está no app.
//   { "mensagem": "quem me deve?", "conversa_id": "<uuid opcional>", "cliente_id": "<uuid opcional>" }
// Responde { conversa_id, cliente_id, resposta, whatsapp, planilhas, gasto_mes_usd }.
// cliente_id amarra uma conversa nova a um cliente (histórico e memórias dele);
// whatsapp traz as mensagens prontas para o botão "Abrir no WhatsApp";
// planilhas traz a consulta e as colunas: a tela roda de novo na hora de
// baixar (dado sempre atual) e monta o .xlsx com o layout da Harmonize.
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
import { CONHECIMENTO } from "./conhecimento.ts";

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
type Estado = { clienteId: string | null; whatsapp: Whats[]; planilhas: Planilha[] };

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

  let corpo: { mensagem?: string; conversa_id?: string | null; cliente_id?: string | null };
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "Pedido inválido." }, 400);
  }
  const pergunta = String(corpo.mensagem ?? "").trim().slice(0, 4000);
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
  let conversaId = corpo.conversa_id || null;
  let historico: Mensagem[] = [];
  const estado: Estado = { clienteId: corpo.cliente_id && UUID.test(corpo.cliente_id) ? corpo.cliente_id : null, whatsapp: [], planilhas: [] };
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

  for (let rodada = 0; rodada <= MAX_RODADAS; rodada++) {
    const ultimaRodada = rodada === MAX_RODADAS;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 2500,
        system: [
          { type: "text", text: CONHECIMENTO, cache_control: { type: "ephemeral" } },
          { type: "text", text: contexto },
        ],
        tools: FERRAMENTAS,
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
  if (conversaId) {
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
    gasto_mes_usd: Math.round((gastoAntes + custo) * 100) / 100,
  });
});
