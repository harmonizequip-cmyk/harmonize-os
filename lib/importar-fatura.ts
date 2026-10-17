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
}

export interface PlanoImportacao {
  itens: ItemImportacao[];
  faturaRef: string;
  pagamentos: { qtd: number; total: number };
  creditos: { qtd: number; total: number };
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
    inicio: dataOfx(etiqueta(texto, "DTSTART")),
    fim: dataOfx(etiqueta(texto, "DTEND")),
    saldo: Number.isFinite(saldo) ? saldo : null,
    linhas,
  };
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
export function planejarImportacao(fatura: FaturaLida, opcoes: { diaVencimento: number; modo: "aberta" | "paga"; faturaRef?: string }): PlanoImportacao {
  const fim = fatura.fim ?? fatura.linhas.reduce((m, l) => (l.data > m ? l.data : m), fatura.linhas[0].data);
  const faturaRef = opcoes.faturaRef ?? refDaFatura(fim, opcoes.diaVencimento);
  const itens: ItemImportacao[] = [];
  const repetidas = new Map<string, number>();
  const maisRecente = new Map<string, LinhaFatura>(); // por compra parcelada: a parcela de maior número

  for (const l of fatura.linhas) {
    if (l.tipo !== "compra") continue;
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

  const soma = (tipo: TipoLinha) => {
    const ls = fatura.linhas.filter((l) => l.tipo === tipo);
    return { qtd: ls.length, total: r2(ls.reduce((s, l) => s + l.valor, 0)) };
  };
  return { itens, faturaRef, pagamentos: soma("pagamento"), creditos: soma("credito") };
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Palavras do estabelecimento -> começo do nome da categoria (a categoria é escolhida entre as que existem).
const PALAVRAS: [string[], string[]][] = [
  [["supermercado", "mercado", "atacad", "hortifruti", "frutos", "padaria", "panificadora", "delicia"], ["mercado", "aliment"]],
  [["restaurant", "lanche", "bobs", "salgado", "ze delivery", "ifood", "pizza", "burger", "sorvet", "cafe"], ["aliment", "restaurante", "lazer"]],
  [["posto", "combust", "shell", "ipiranga", "estacion"], ["combust", "transporte"]],
  [["uber", "99", "unidas", "locadora", "latam", "gol ", "azul", "passagem", "pedagio", "lava jato"], ["transporte", "viagem", "carro"]],
  [["drogasil", "raia", "farma", "drogaria", "pague menos", "redepharma", "iap cosmetico", "total pass", "academia"], ["saude", "farmacia"]],
  [["anthropic", "openai", "claude", "curso", "netflix", "spotify", "assinatura", "google", "apple"], ["assinatura", "educa", "curso", "servico"]],
  [["tim ", "claro", "vivo", "nucel", "oi "], ["telefone", "internet", "conta"]],
];

/** Sugere a categoria (id) pelo nome do estabelecimento; vazio quando não há palpite. */
export function sugerirCategoria(nome: string, categorias: { id: string; name: string }[]): string {
  const alvo = semAcento(nome);
  for (const [palavras, comecos] of PALAVRAS) {
    if (!palavras.some((p) => alvo.includes(p))) continue;
    for (const c of comecos) {
      const achada = categorias.find((x) => semAcento(x.name).includes(c));
      if (achada) return achada.id;
    }
  }
  return "";
}
