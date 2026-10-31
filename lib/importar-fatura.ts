// Importar fatura do cartão (arquivo OFX do banco). Funções puras e testadas.
//
// Formato visto na fatura do Nubank: cada compra é um <STMTTRN> com TRNTYPE
// (DEBIT = compra, CREDIT = pagamento ou desconto), DTPOSTED (AAAAMMDD...),
// TRNAMT (compra negativa), FITID e MEMO. Parcela vem no fim do MEMO ("... -
// Parcela 3/12"). O FITID é o mesmo em todas as parcelas da mesma compra (e no
// IOF ou desconto dela), então serve para ligar as parcelas entre faturas.

import { somarMesesRef } from "./cartao";

export type TipoLinha = "compra" | "pagamento" | "credito";

export interface LinhaFatura {
  fitid: string;
  data: string; // AAAA-MM-DD
  valor: number; // sempre positivo
  tipo: TipoLinha;
  memo: string;
  /** Nome sem o "- Parcela k/n". */
  descricao: string;
  parcela: { k: number; n: number } | null;
}

export interface FaturaLida {
  /** "ofx" tem o código da compra (FITID); "csv" não tem, então a chave sai do conteúdo. */
  formato: "ofx" | "csv";
  inicio: string | null;
  fim: string | null;
  saldo: number | null;
  linhas: LinhaFatura[];
}

export interface ItemImportacao {
  chave: string;
  grupo: string;
  data: string;
  valor: number;
  descricao: string;
  /** Nome para agrupar na prévia e escolher a categoria uma vez. */
  nome: string;
  fatura_ref: string;
  parcela_num: number | null;
  parcelas_total: number | null;
  /** "fatura" = linha que está no arquivo; "futura" = parcela que ainda vai vir. */
  origem: "fatura" | "futura";
  /** Quanto de desconto ou estorno do banco já foi tirado do valor desta linha. */
  abatido?: number;
  /** "pagamento" = pagamento de fatura feito no banco (sai do saldo). Sem valor = compra. */
  tipo?: "compra" | "pagamento";
  /** Juros, IOF, multa ou encargos do cartão (rotativo, atraso, parcelamento da fatura). */
  encargo?: boolean;
}

/** Rotativo: o que ficou da fatura anterior e como os pagamentos do arquivo o quitam. */
export interface Rotativo {
  /** "Valor pendente do mês anterior": a fatura anterior passada para frente (não é compra). */
  pendente: number;
  /** Quanto dos pagamentos do arquivo quitou o pendente (vai para a fatura anterior). */
  quitado: number;
  /** Fatura anterior (AAAA-MM). */
  refAnterior: string;
  /** Juros, IOF, multa e encargos do arquivo. */
  encargos: number;
}

export interface Abatimento {
  descricao: string;
  valor: number;
  /** Parte que achou onde abater (o resto fica de fora). */
  aplicado: number;
  linhas: number;
}

export interface PlanoImportacao {
  itens: ItemImportacao[];
  faturaRef: string;
  pagamentos: { qtd: number; total: number };
  /** Pagamentos que vão ser registrados (a partir da data de corte). */
  pagamentosARegistrar: { qtd: number; total: number };
  creditos: { qtd: number; total: number };
  /** Descontos e estornos do banco abatidos das compras a que se referem. */
  abatimentos: Abatimento[];
  /** Só quando o arquivo traz "Valor pendente do mês anterior" ou encargos. */
  rotativo: Rotativo | null;
}

/** "Valor pendente do mês anterior (rotativo)": é a fatura anterior, não compra. */
export function ehValorPendente(memo: string): boolean {
  return /^\s*valor pendente do m[eê]s anterior/i.test(memo);
}

/**
 * Juros, multa e encargos do cartão; IOF só quando é do rotativo, do atraso ou do
 * parcelamento da fatura (o IOF de compra internacional continua sendo da compra).
 */
export function ehEncargo(memo: string): boolean {
  const t = semAcento(memo).trim();
  if (/^(juros|multa|encargos?)\b/.test(t)) return true;
  return /^iof\b/.test(t) && /(rotativo|atraso|parcelamento|pagamento parcial|fatura|financiamento)/.test(t);
}

/** Lê o arquivo em UTF-8 e, se vier com caracteres quebrados, em Windows-1252. */
export function decodificarArquivo(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  if (!utf8.includes("�")) return utf8;
  return new TextDecoder("windows-1252").decode(buf);
}

const entidades = (t: string) =>
  t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

function etiqueta(bloco: string, nome: string): string | null {
  const m = new RegExp(`<${nome}>([^<\\r\\n]*)`, "i").exec(bloco);
  return m ? entidades(m[1].trim()) : null;
}

function dataOfx(valor: string | null): string | null {
  const m = valor ? /^(\d{4})(\d{2})(\d{2})/.exec(valor) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

const PARCELA = /\s*-\s*Parcela\s+(\d+)\s*\/\s*(\d+)\s*$/i;

export function lerOfx(texto: string): FaturaLida {
  if (!/<OFX>/i.test(texto)) throw new Error("Não parece um arquivo OFX de fatura.");
  const linhas: LinhaFatura[] = [];
  for (const m of texto.matchAll(/<STMTTRN>([\s\S]*?)(?:<\/STMTTRN>|(?=<STMTTRN>)|<\/BANKTRANLIST>)/gi)) {
    const bloco = m[1];
    const data = dataOfx(etiqueta(bloco, "DTPOSTED"));
    const bruto = Number((etiqueta(bloco, "TRNAMT") ?? "").replace(",", "."));
    if (!data || !Number.isFinite(bruto) || bruto === 0) continue;
    const memo = etiqueta(bloco, "MEMO") ?? "Sem descrição";
    const tipoOfx = (etiqueta(bloco, "TRNTYPE") ?? "").toUpperCase();
    const credito = tipoOfx === "CREDIT" || bruto > 0;
    const parcela = PARCELA.exec(memo);
    linhas.push({
      fitid: etiqueta(bloco, "FITID") ?? memo,
      data,
      valor: Math.round(Math.abs(bruto) * 100) / 100,
      tipo: !credito ? "compra" : /pagamento/i.test(memo) ? "pagamento" : "credito",
      memo,
      descricao: parcela ? memo.replace(PARCELA, "").trim() : memo,
      parcela: parcela && !credito ? { k: Number(parcela[1]), n: Number(parcela[2]) } : null,
    });
  }
  if (linhas.length === 0) throw new Error("Nenhuma compra encontrada no arquivo.");
  const saldo = Number((etiqueta(texto, "BALAMT") ?? "").replace(",", "."));
  return {
    formato: "ofx",
    inicio: dataOfx(etiqueta(texto, "DTSTART")),
    fim: dataOfx(etiqueta(texto, "DTEND")),
    saldo: Number.isFinite(saldo) ? saldo : null,
    linhas,
  };
}

/** Divide uma linha de CSV respeitando aspas ("" dentro de aspas vira "). */
function camposCsv(linha: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') aspas = false;
      else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else atual += c;
  }
  campos.push(atual);
  return campos;
}

/** "1.234,56" e "- 300,00" (crédito) viram número; devolve negativo para crédito. */
function valorBr(txt: string): number {
  const negativo = /^\s*-/.test(txt);
  const n = Number(txt.replace(/[^\d,]/g, "").replace(",", "."));
  return negativo ? -n : n;
}

/** CSV do Nubank: date,title,amount (valor com vírgula; "- 300,00" é pagamento ou desconto). Sem código da compra. */
export function lerCsv(texto: string): FaturaLida {
  const linhasTexto = texto.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  const cab = camposCsv(linhasTexto[0] ?? "").map((c) => semAcento(c.trim()));
  const iData = cab.indexOf("date") >= 0 ? cab.indexOf("date") : cab.indexOf("data");
  const iTitulo = cab.indexOf("title") >= 0 ? cab.indexOf("title") : cab.indexOf("descricao");
  const iValor = cab.indexOf("amount") >= 0 ? cab.indexOf("amount") : cab.indexOf("valor");
  if (iData < 0 || iTitulo < 0 || iValor < 0) throw new Error("Não reconheci as colunas do CSV (esperava data, descrição e valor).");
  const linhas: LinhaFatura[] = [];
  for (const l of linhasTexto.slice(1)) {
    const c = camposCsv(l);
    const data = /^\d{4}-\d{2}-\d{2}$/.test((c[iData] ?? "").trim())
      ? c[iData].trim()
      : (() => {
          const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((c[iData] ?? "").trim());
          return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
        })();
    const bruto = valorBr(c[iValor] ?? "");
    const memo = (c[iTitulo] ?? "").trim();
    if (!data || !memo || !Number.isFinite(bruto) || bruto === 0) continue;
    const credito = bruto < 0;
    const valor = Math.round(Math.abs(bruto) * 100) / 100;
    const parcela = PARCELA.exec(memo);
    const descricao = parcela ? memo.replace(PARCELA, "").trim() : memo;
    linhas.push({
      // Sem código de compra: parcelas se ligam por nome e valor; compra avulsa, pela data.
      fitid: parcela && !credito ? `csv|${descricao}|${valor.toFixed(2)}` : `csv|${data}`,
      data,
      valor,
      tipo: !credito ? "compra" : /pagamento/i.test(memo) ? "pagamento" : "credito",
      memo,
      descricao,
      parcela: parcela && !credito ? { k: Number(parcela[1]), n: Number(parcela[2]) } : null,
    });
  }
  if (linhas.length === 0) throw new Error("Nenhuma compra encontrada no arquivo.");
  return { formato: "csv", inicio: null, fim: null, saldo: null, linhas };
}

/** Lê OFX ou CSV, pelo conteúdo. */
export function lerFatura(texto: string): FaturaLida {
  return /<OFX>/i.test(texto) ? lerOfx(texto) : lerCsv(texto);
}

/** Nubank_2026-10-02.ofx: a data no nome é o vencimento da fatura. */
export function refDoNomeDoArquivo(nome: string): string | null {
  const m = /(\d{4})-(\d{2})-\d{2}/.exec(nome);
  return m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? `${m[1]}-${m[2]}` : null;
}

/** Primeiro vencimento depois do fechamento: é o mês (AAAA-MM) da fatura. */
export function refDaFatura(fim: string, diaVencimento: number): string {
  const [a, m, d] = fim.split("-").map(Number);
  const ultimo = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const mesmoMes = Math.min(diaVencimento, ultimo(a, m)) > d;
  const ref = `${a}-${String(m).padStart(2, "0")}`;
  return mesmoMes ? ref : somarMesesRef(ref, 1);
}

/** Soma meses a uma data AAAA-MM-DD mantendo o dia (31 vira o último dia do mês curto). */
export function somarMesesData(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  const ano = Math.floor(t / 12);
  const mes = (t % 12) + 1;
  const dia = Math.min(d, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Monta o que vai ser lançado.
 * - modo "aberta": as compras e parcelas do arquivo, mais as parcelas que ainda faltam;
 * - modo "paga": só as parcelas que ainda faltam (a fatura em si já foi paga).
 * Pagamentos e descontos do banco não viram compra (vêm só no resumo).
 */
export function planejarImportacao(
  fatura: FaturaLida,
  opcoes: { diaVencimento: number; modo: "aberta" | "paga"; faturaRef?: string; pagamentosDesde?: string | null }
): PlanoImportacao {
  const fim = fatura.fim ?? fatura.linhas.reduce((m, l) => (l.data > m ? l.data : m), fatura.linhas[0].data);
  const faturaRef = opcoes.faturaRef ?? refDaFatura(fim, opcoes.diaVencimento);
  const itens: ItemImportacao[] = [];
  const repetidas = new Map<string, number>();
  const maisRecente = new Map<string, LinhaFatura>(); // por compra parcelada: a parcela de maior número

  for (const l of fatura.linhas) {
    if (l.tipo !== "compra" || ehValorPendente(l.memo)) continue;
    if (l.parcela) {
      const grupo = `${l.fitid}|${l.parcela.n}`;
      const atual = maisRecente.get(grupo);
      if (!atual || l.parcela.k > atual.parcela!.k) maisRecente.set(grupo, l);
      if (opcoes.modo === "aberta") {
        itens.push({
          chave: `${l.fitid}|p${l.parcela.k}/${l.parcela.n}`,
          grupo,
          data: l.data,
          valor: l.valor,
          descricao: `${l.descricao} (${l.parcela.k}/${l.parcela.n})`,
          nome: l.descricao,
          fatura_ref: faturaRef,
          parcela_num: l.parcela.k,
          parcelas_total: l.parcela.n,
          origem: "fatura",
        });
      }
    } else if (opcoes.modo === "aberta") {
      const base = `${l.fitid}|${l.memo}|${l.valor.toFixed(2)}`;
      const vez = (repetidas.get(base) ?? 0) + 1;
      repetidas.set(base, vez);
      itens.push({
        chave: vez > 1 ? `${base}#${vez}` : base,
        grupo: l.fitid,
        data: l.data,
        valor: l.valor,
        descricao: l.memo,
        nome: l.descricao,
        fatura_ref: faturaRef,
        parcela_num: null,
        parcelas_total: null,
        origem: "fatura",
        ...(ehEncargo(l.memo) ? { encargo: true } : {}),
      });
    }
  }

  // Parcelas que ainda faltam: da seguinte à última do arquivo, uma por fatura.
  for (const [grupo, l] of maisRecente) {
    const { k, n } = l.parcela!;
    for (let j = k + 1; j <= n; j++) {
      itens.push({
        chave: `${l.fitid}|p${j}/${n}`,
        grupo,
        data: somarMesesData(l.data, j - k),
        valor: l.valor,
        descricao: `${l.descricao} (${j}/${n})`,
        nome: l.descricao,
        fatura_ref: somarMesesRef(faturaRef, j - k),
        parcela_num: j,
        parcelas_total: n,
        origem: "futura",
      });
    }
  }

  const abatimentos = opcoes.modo === "aberta" ? abaterCreditos(fatura, itens) : [];

  // Rotativo: "Valor pendente do mês anterior" de V. Os pagamentos do arquivo, em ordem de data,
  // primeiro quitam V (fatura anterior); o que passa de V fica nesta fatura. Os pagamentos de
  // antes da data de corte também quitam V, só não são registrados de novo.
  const anterior = somarMesesRef(faturaRef, -1);
  const pendente = r2(fatura.linhas.filter((l) => l.tipo === "compra" && ehValorPendente(l.memo)).reduce((s, l) => s + l.valor, 0));
  const encargos = r2(fatura.linhas.filter((l) => l.tipo === "compra" && ehEncargo(l.memo)).reduce((s, l) => s + l.valor, 0));
  let faltaQuitar = pendente;

  // Pagamentos feitos no banco a partir da data de corte (os antigos já estão no saldo informado).
  // Sem rotativo: pagamento até o vencimento da fatura anterior paga aquela; depois dele, esta.
  const pagamentosARegistrar = { qtd: 0, total: 0 };
  const [ya, ma] = anterior.split("-").map(Number);
  const diaAnterior = Math.min(opcoes.diaVencimento, new Date(Date.UTC(ya, ma, 0)).getUTCDate());
  const vencAnterior = `${anterior}-${String(diaAnterior).padStart(2, "0")}`;
  const vistas = new Map<string, number>();
  // A chave conta as repetições na ordem do arquivo (igual a antes); a quitação segue a data.
  const pagamentos = fatura.linhas
    .filter((l) => l.tipo === "pagamento")
    .map((l) => {
      const registrar = !!opcoes.pagamentosDesde && l.data >= opcoes.pagamentosDesde;
      const base = fatura.formato === "ofx" ? `${l.fitid}|pag|${l.valor.toFixed(2)}` : `csv|pag|${l.data}|${l.valor.toFixed(2)}`;
      // Como antes: só os que vão ser registrados contam para o "#2".
      const vez = registrar ? (vistas.get(base) ?? 0) + 1 : 1;
      if (registrar) vistas.set(base, vez);
      return { l, registrar, chave: vez > 1 ? `${base}#${vez}` : base };
    })
    .map((p, ordem) => ({ ...p, ordem }))
    .sort((a, b) => (a.l.data === b.l.data ? a.ordem - b.ordem : a.l.data < b.l.data ? -1 : 1));
  const pagamento = (chave: string, l: LinhaFatura, valor: number, ref: string): ItemImportacao => ({
    chave,
    grupo: "pagamento",
    data: l.data,
    valor,
    descricao: "Pagamento de fatura",
    nome: "Pagamento de fatura",
    fatura_ref: ref,
    parcela_num: null,
    parcelas_total: null,
    origem: "fatura",
    tipo: "pagamento",
  });
  for (const { l, chave, registrar } of pagamentos) {
    const novos: ItemImportacao[] = [];
    if (pendente > 0) {
      const quita = r2(Math.min(faltaQuitar, l.valor));
      faltaQuitar = r2(faltaQuitar - quita);
      if (quita > 0 && quita < l.valor) {
        novos.push(pagamento(`${chave}|parte1`, l, quita, anterior), pagamento(`${chave}|parte2`, l, r2(l.valor - quita), faturaRef));
      } else {
        novos.push(pagamento(chave, l, l.valor, quita > 0 ? anterior : faturaRef));
      }
    } else {
      novos.push(pagamento(chave, l, l.valor, l.data > vencAnterior ? faturaRef : anterior));
    }
    if (!registrar) continue;
    itens.push(...novos);
    pagamentosARegistrar.qtd += 1;
    pagamentosARegistrar.total = r2(pagamentosARegistrar.total + l.valor);
  }
  const rotativo: Rotativo | null =
    pendente > 0 || encargos > 0 ? { pendente, quitado: r2(pendente - faltaQuitar), refAnterior: anterior, encargos } : null;

  const soma = (tipo: TipoLinha) => {
    const ls = fatura.linhas.filter((l) => l.tipo === tipo);
    return { qtd: ls.length, total: r2(ls.reduce((s, l) => s + l.valor, 0)) };
  };
  return { itens, faturaRef, pagamentos: soma("pagamento"), pagamentosARegistrar, creditos: soma("credito"), abatimentos, rotativo };
}

const semPrefixoDeCredito = (memo: string) =>
  memo.replace(/^\s*(desconto\s+(de\s+)?antecipa\S*|estorno(\s+de)?|cr[eé]dito(\s+de)?)\s+/i, "").trim();

/**
 * Desconto de antecipação e estorno reduzem o que se paga na fatura. O app não guarda valor
 * negativo, então o crédito é abatido das compras a que se refere (no OFX, as de mesmo código;
 * no CSV, as de mesmo nome), repartido pelo peso de cada uma. Só mexe nas linhas da fatura
 * que estão sendo lançadas; as parcelas futuras ficam com o valor cheio.
 */
function abaterCreditos(fatura: FaturaLida, itens: ItemImportacao[]): Abatimento[] {
  const resultado: Abatimento[] = [];
  const doArquivo = itens.filter((i) => i.origem === "fatura" && i.tipo !== "pagamento");
  for (const c of fatura.linhas) {
    if (c.tipo !== "credito") continue;
    const alvoNome = semAcento(semPrefixoDeCredito(c.memo));
    let alvos =
      fatura.formato === "ofx" ? doArquivo.filter((i) => i.grupo === c.fitid || i.grupo.startsWith(`${c.fitid}|`)) : [];
    if (alvos.length === 0) alvos = doArquivo.filter((i) => semAcento(i.nome) === alvoNome);
    const base = alvos.reduce((s, i) => s + i.valor, 0);
    // Nunca deixa uma linha em zero: o que passar do valor das compras fica sem abater.
    const aplicavel = Math.min(c.valor, Math.max(0, base - 0.01 * alvos.length));
    if (alvos.length === 0 || aplicavel <= 0) {
      resultado.push({ descricao: c.memo, valor: c.valor, aplicado: 0, linhas: 0 });
      continue;
    }
    let restante = r2(aplicavel);
    alvos.forEach((i, idx) => {
      const parte = idx === alvos.length - 1 ? restante : Math.min(restante, r2((aplicavel * i.valor) / base));
      restante = r2(restante - parte);
      i.valor = r2(i.valor - parte);
      i.abatido = r2((i.abatido ?? 0) + parte);
    });
    resultado.push({ descricao: c.memo, valor: c.valor, aplicado: r2(aplicavel), linhas: alvos.length });
  }
  return resultado;
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Palavras do estabelecimento -> começo do nome da categoria (a categoria é escolhida entre as que existem).
// Texto casa como pedaço do nome; expressão regular, como está escrita (para palavras curtas como "99" e "meta").
// As primeiras listas vêm antes porque são mais específicas ("Google Ads" antes de "google").
const PALAVRAS: [(string | RegExp)[], string[]][] = [
  [["facebk", "facebook", /\bmeta\b/, "rd station", "google ads", "hostinger", "publigyn"], ["marketing"]],
  [["unidas", "localiza", "movida", /\buber\b/, /\b99\b/], ["transporte"]],
  [["ferreira costa", "materiais", "tintas", "torneira", "nordife", "leroy"], ["manutencao e obras", "manutencao"]],
  [["hotel", "booking", "pousada"], ["hospedagem"]],
  [["contourline", "nobreak"], ["parcela de equipamento"]],
  [["supermercado", /\bmercado\b/, "atacad", "hortifruti", "frutos", "padaria", "panificadora", "delicia"], ["mercado", "aliment"]],
  [["restaurant", "lanche", "bobs", "salgado", "ze delivery", "ifood", "pizza", "burger", "sorvet", "cafe"], ["aliment", "restaurante", "lazer"]],
  [["posto", "combust", "shell", "ipiranga", "estacion"], ["combust", "transporte"]],
  [["uber", "99", "unidas", "locadora", "latam", "gol ", "azul", "passagem", "pedagio", "lava jato"], ["transporte", "viagem", "carro"]],
  [["drogasil", "raia", "farma", "drogaria", "pague menos", "redepharma", "iap cosmetico", "total pass", "academia"], ["saude", "farmacia"]],
  [["anthropic", "openai", "claude", "curso", "netflix", "spotify", "assinatura", "google", "apple"], ["assinatura", "educa", "curso", "servico"]],
  [["tim ", "claro", "vivo", "nucel", "oi "], ["telefone", "internet", "conta"]],
];

/** Categoria dos juros, IOF, multa e encargos do cartão. */
const CATEGORIA_ENCARGOS = "juros e encargos do cartao";

/** Sugere a categoria (id) pelo nome do estabelecimento; vazio quando não há palpite. */
export function sugerirCategoria(nome: string, categorias: { id: string; name: string }[]): string {
  const alvo = semAcento(nome);
  if (ehEncargo(nome)) return categorias.find((x) => semAcento(x.name).trim() === CATEGORIA_ENCARGOS)?.id ?? "";
  // Mercado Livre vende de tudo: sem palpite (e "mercado" não pode casar com "Mercadol").
  if (/mercado\s*livre|mercadol/.test(alvo)) return "";
  for (const [palavras, comecos] of PALAVRAS) {
    if (!palavras.some((p) => (typeof p === "string" ? alvo.includes(p) : p.test(alvo)))) continue;
    for (const c of comecos) {
      const achada = categorias.find((x) => semAcento(x.name).includes(c));
      if (achada) return achada.id;
    }
  }
  return "";
}

/** Linha já lançada no cartão com chave de importação (para conferir antes de gravar). */
export interface LancadaNoCartao {
  fatura_ref: string;
  amount: number;
  description: string | null;
  data_compra: string | null;
}

/** Pagamento de fatura já lançado no cartão (importado ou do "Pagar fatura"). */
export interface PagamentoLancado {
  date: string;
  amount: number;
  importacao_chave: string | null;
}

export type SituacaoItem = "nova" | "antecipada" | "atualizar" | "repetida" | "pagamento_lancado";

const semRepeticao = (chave: string) => chave.replace(/#\d+$/, "");
const PARTE = /\|parte\d+$/;

/** Pagamento do arquivo que já está lançado no cartão (mesma regra de importar_compras_cartao). */
export function pagamentoJaLancado(item: Pick<ItemImportacao, "chave" | "data" | "valor">, pagamentos: PagamentoLancado[]): boolean {
  const raiz = item.chave.replace(PARTE, "");
  const dividido = PARTE.test(item.chave);
  return pagamentos.some((p) => {
    const k = p.importacao_chave;
    if (k === item.chave) return true;
    if (dividido ? k === raiz : !!k && k.startsWith(`${item.chave}|parte`)) return true;
    const mesmoDia = p.date === item.data && Math.abs(Number(p.amount) - item.valor) < 0.005;
    return mesmoDia && (!k || semRepeticao(k) !== semRepeticao(item.chave));
  });
}

/**
 * O que acontece com o item ao importar (a mesma regra de importar_compras_cartao):
 * nova; antecipada (a mesma chave numa fatura futura vem para esta); atualizar (linha real da
 * fatura, já lançada nesta mesma fatura, com valor, descrição ou dia da compra diferentes);
 * repetida; pagamento_lancado (pagamento com a mesma data e valor já está no cartão).
 */
export function situacaoDoItem(item: ItemImportacao, existentes: Map<string, LancadaNoCartao>, pagamentos: PagamentoLancado[]): SituacaoItem {
  if (item.tipo === "pagamento") return pagamentoJaLancado(item, pagamentos) ? "pagamento_lancado" : "nova";
  const atual = existentes.get(item.chave);
  if (!atual) return "nova";
  if (item.fatura_ref < atual.fatura_ref) return "antecipada";
  if (item.origem === "fatura" && item.fatura_ref === atual.fatura_ref) {
    const difere =
      Math.abs(Number(atual.amount) - item.valor) >= 0.005 || (atual.description ?? "") !== item.descricao.trim().slice(0, 200) || (atual.data_compra ?? "") !== item.data;
    if (difere) return "atualizar";
  }
  return "repetida";
}

export interface LinhaImportada {
  created_at: string;
  amount: number;
  fatura_ref: string | null;
  cartao_mov: "compra" | "pagamento" | null;
}

export interface SessaoImportacao {
  /** Janela (com 1 s de folga) para desfazer só esta importação. */
  desde: string;
  ate: string;
  inicio: string;
  lancamentos: number;
  total: number;
  pagamentos: number;
  faturaDe: string;
  faturaAte: string;
}

/**
 * Agrupa as linhas importadas em importações: cada tela "Importar" grava em lotes de poucos
 * segundos, então lotes a menos de `lacunaMin` minutos um do outro são a mesma importação.
 * Do mais recente ao mais antigo.
 */
export function agruparImportacoes(linhas: LinhaImportada[], lacunaMin = 10): SessaoImportacao[] {
  const ordenadas = [...linhas].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const sessoes: LinhaImportada[][] = [];
  for (const l of ordenadas) {
    const atual = sessoes[sessoes.length - 1];
    const ultimo = atual?.[atual.length - 1];
    if (atual && ultimo && new Date(l.created_at).getTime() - new Date(ultimo.created_at).getTime() <= lacunaMin * 60000) atual.push(l);
    else sessoes.push([l]);
  }
  return sessoes
    .map((ls) => {
      const compras = ls.filter((l) => l.cartao_mov !== "pagamento");
      const refs = compras.map((l) => l.fatura_ref ?? "").filter(Boolean).sort();
      const t0 = new Date(ls[0].created_at).getTime();
      const t1 = new Date(ls[ls.length - 1].created_at).getTime();
      return {
        desde: new Date(t0 - 1000).toISOString(),
        ate: new Date(t1 + 1000).toISOString(),
        inicio: ls[0].created_at,
        lancamentos: compras.length,
        total: r2(compras.reduce((s, l) => s + Number(l.amount), 0)),
        pagamentos: ls.length - compras.length,
        faturaDe: refs[0] ?? "",
        faturaAte: refs[refs.length - 1] ?? "",
      };
    })
    .reverse();
}
