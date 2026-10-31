import { describe, expect, it } from "vitest";
import {
  agruparImportacoes,
  ehEncargo,
  ehValorPendente,
  lerCsv,
  lerFatura,
  lerOfx,
  pagamentoJaLancado,
  planejarImportacao,
  refDaFatura,
  refDoNomeDoArquivo,
  situacaoDoItem,
  somarMesesData,
  sugerirCategoria,
  type ItemImportacao,
  type LancadaNoCartao,
} from "./importar-fatura";

const bloco = (tipo: string, data: string, valor: string, fitid: string, memo: string) =>
  `<STMTTRN>\n<TRNTYPE>${tipo}</TRNTYPE>\n<DTPOSTED>${data}000000[-3:BRT]</DTPOSTED>\n<TRNAMT>${valor}</TRNAMT>\n<FITID>${fitid}</FITID>\n<MEMO>${memo}</MEMO>\n</STMTTRN>\n`;

const OFX =
  `OFXHEADER:100\nDATA:OFXSGML\n<OFX>\n<CREDITCARDMSGSRSV1>\n<CCSTMTTRNRS>\n<CCSTMTRS>\n<BANKTRANLIST>\n<DTSTART>20260826000000[-3:BRT]</DTSTART>\n<DTEND>20260925000000[-3:BRT]</DTEND>\n` +
  bloco("DEBIT", "20260924", "-43.74", "a1", "Loja Qualquer") +
  bloco("DEBIT", "20260905", "-106.61", "b1", "Anthropic") +
  bloco("DEBIT", "20260905", "-3.73", "b1", 'IOF de &quot;Anthropic&quot;') +
  bloco("DEBIT", "20260826", "-573.84", "c1", "Latam Air - Parcela 1/4") +
  bloco("DEBIT", "20260826", "-30.72", "d1", "Curso Online - Parcela 2/12") +
  bloco("DEBIT", "20260826", "-30.72", "d1", "Curso Online - Parcela 11/12") +
  bloco("DEBIT", "20260826", "-30.72", "d1", "Curso Online - Parcela 12/12") +
  bloco("CREDIT", "20260826", "13.75", "d1", "Desconto Antecipação Curso Online") +
  bloco("DEBIT", "20260826", "-125.83", "e1", "Lavagem - Parcela 3/12") +
  bloco("DEBIT", "20260826", "-125.83", "e1", "Lavagem - Parcela 5/12") +
  bloco("DEBIT", "20260826", "-125.83", "e1", "Lavagem - Parcela 4/12") +
  bloco("DEBIT", "20260920", "-20.00", "f1", "Mesma Loja") +
  bloco("DEBIT", "20260920", "-20.00", "f1", "Mesma Loja") +
  bloco("CREDIT", "20260919", "1000.00", "g1", "Pagamento recebido") +
  `</BANKTRANLIST>\n<LEDGERBAL>\n<BALAMT>-100.50</BALAMT>\n</LEDGERBAL>\n</CCSTMTRS>\n</CCSTMTTRNRS>\n</CREDITCARDMSGSRSV1>\n</OFX>`;

describe("ler OFX", () => {
  const f = lerOfx(OFX);

  it("lê período, saldo e as linhas", () => {
    expect(f.inicio).toBe("2026-08-26");
    expect(f.fim).toBe("2026-09-25");
    expect(f.saldo).toBe(-100.5);
    expect(f.linhas).toHaveLength(14);
  });

  it("separa compra, pagamento e desconto, com valor positivo", () => {
    const tipos = f.linhas.map((l) => l.tipo);
    expect(tipos.filter((t) => t === "pagamento")).toHaveLength(1);
    expect(tipos.filter((t) => t === "credito")).toHaveLength(1);
    expect(f.linhas[0]).toMatchObject({ tipo: "compra", valor: 43.74, data: "2026-09-24" });
  });

  it("tira a parcela do nome e decodifica entidades", () => {
    const parcela = f.linhas.find((l) => l.memo === "Latam Air - Parcela 1/4")!;
    expect(parcela.descricao).toBe("Latam Air");
    expect(parcela.parcela).toEqual({ k: 1, n: 4 });
    expect(f.linhas.find((l) => l.memo.startsWith("IOF"))!.memo).toBe('IOF de "Anthropic"');
  });

  it("recusa arquivo que não é OFX", () => {
    expect(() => lerOfx("data,titulo\n1,2")).toThrow(/OFX/);
  });

  it("lê também OFX sem tag de fechamento nas linhas", () => {
    const sgml = OFX.replace(/<\/(TRNTYPE|DTPOSTED|TRNAMT|FITID|MEMO|STMTTRN)>/g, "");
    expect(lerOfx(sgml).linhas).toHaveLength(14);
  });
});

describe("fatura de referência", () => {
  it("é o primeiro vencimento depois do fechamento", () => {
    expect(refDaFatura("2026-09-25", 2)).toBe("2026-10");
    expect(refDaFatura("2026-10-26", 2)).toBe("2026-11");
    expect(refDaFatura("2026-09-20", 28)).toBe("2026-09");
    expect(refDaFatura("2026-12-26", 2)).toBe("2027-01");
  });

  it("soma meses mantendo o dia", () => {
    expect(somarMesesData("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMesesData("2026-11-26", 3)).toBe("2027-02-26");
  });
});

describe("plano de importação", () => {
  const f = lerOfx(OFX);

  it("fatura já paga: só as parcelas que faltam, depois da última do arquivo", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "paga" });
    expect(p.faturaRef).toBe("2026-10");
    // Latam 1/4 -> 2,3,4; Lavagem 5/12 -> 6..12 (3,4,5 vieram juntas); Curso 12/12 -> nada
    const por = (nome: string) => p.itens.filter((i) => i.nome === nome);
    expect(por("Latam Air").map((i) => i.parcela_num)).toEqual([2, 3, 4]);
    expect(por("Latam Air").map((i) => i.fatura_ref)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(por("Lavagem").map((i) => i.parcela_num)).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(por("Curso Online")).toHaveLength(0);
    expect(p.itens.every((i) => i.origem === "futura")).toBe(true);
    expect(p.itens.find((i) => i.nome === "Latam Air")).toMatchObject({ valor: 573.84, descricao: "Latam Air (2/4)", data: "2026-09-26" });
  });

  it("fatura em aberto: lança tudo e ainda cria as parcelas futuras", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "aberta" });
    const doArquivo = p.itens.filter((i) => i.origem === "fatura");
    expect(doArquivo).toHaveLength(12); // 14 linhas menos o pagamento e o desconto
    expect(doArquivo.every((i) => i.fatura_ref === "2026-10")).toBe(true);
    expect(p.itens.filter((i) => i.origem === "futura")).toHaveLength(3 + 7);
  });

  it("chaves únicas, mesmo com compras idênticas no arquivo", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "aberta" });
    const chaves = p.itens.map((i) => i.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
    expect(chaves.filter((c) => c.startsWith("f1|Mesma Loja"))).toEqual(["f1|Mesma Loja|20.00", "f1|Mesma Loja|20.00#2"]);
  });

  it("a parcela da fatura seguinte tem a mesma chave da criada antes", () => {
    const antes = planejarImportacao(f, { diaVencimento: 2, modo: "paga" });
    const proxima = lerOfx(
      OFX.replace("20260925000000", "20261026000000") + "" // mesmo arquivo, outro fechamento, só para a chave
    );
    const depois = planejarImportacao(proxima, { diaVencimento: 2, modo: "aberta" });
    const chaveLatam2 = antes.itens.find((i) => i.nome === "Latam Air" && i.parcela_num === 2)!.chave;
    expect(chaveLatam2).toBe("c1|p2/4");
    expect(depois.itens.some((i) => i.chave === "c1|p1/4")).toBe(true);
  });

  it("resumo de pagamentos e descontos que não viram compra", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "paga" });
    expect(p.pagamentos).toEqual({ qtd: 1, total: 1000 });
    expect(p.creditos).toEqual({ qtd: 1, total: 13.75 });
  });
});

describe("categoria sugerida", () => {
  const cats = [
    { id: "1", name: "Mercado" },
    { id: "2", name: "Combustível" },
    { id: "3", name: "Saúde" },
    { id: "4", name: "Alimentação" },
  ];
  it("acha pelo estabelecimento e deixa vazio sem palpite", () => {
    expect(sugerirCategoria("Supermercado Bem Mais", cats)).toBe("1");
    expect(sugerirCategoria("Posto Ipiranga", cats)).toBe("2");
    expect(sugerirCategoria("Raia Drogasil", cats)).toBe("3");
    expect(sugerirCategoria("Loja Qualquer", cats)).toBe("");
  });
});

const CSV = [
  "date,title,amount",
  '2026-09-24,Lojas Americanas,"43,74"',
  '2026-09-19,Pagamento recebido,"- 1.000,00"',
  '2026-09-19,Desconto Antecipação Unidas,"- 4,29"',
  '2026-09-05,"IOF de ""Anthropic""","3,73"',
  '2026-08-26,Latam Air - Parcela 1/4,"1.573,84"',
  '2026-08-26,Lavagem - Parcela 3/12,"125,83"',
  '2026-08-26,Lavagem - Parcela 5/12,"125,83"',
  '2026-08-26,Lavagem - Parcela 4/12,"125,83"',
  '2026-09-16,Posto,"81,00"',
  '2026-09-16,Posto,"81,00"',
].join("\n");

describe("CSV do banco", () => {
  const f = lerCsv(CSV);

  it("lê data, título e valor no formato brasileiro, com crédito entre aspas", () => {
    expect(f.formato).toBe("csv");
    expect(f.linhas).toHaveLength(10);
    expect(f.linhas.find((l) => l.memo === "Lojas Americanas")).toMatchObject({ valor: 43.74, tipo: "compra", data: "2026-09-24" });
    expect(f.linhas.find((l) => l.memo.startsWith("Latam"))!.valor).toBe(1573.84);
    expect(f.linhas.find((l) => l.memo === "Pagamento recebido")).toMatchObject({ tipo: "pagamento", valor: 1000 });
    expect(f.linhas.find((l) => l.memo.startsWith("Desconto"))).toMatchObject({ tipo: "credito", valor: 4.29 });
    expect(f.linhas.find((l) => l.memo.startsWith("IOF"))!.memo).toBe('IOF de "Anthropic"');
  });

  it("escolhe o leitor pelo conteúdo e recusa coluna desconhecida", () => {
    expect(lerFatura(CSV).formato).toBe("csv");
    expect(lerFatura(OFX).formato).toBe("ofx");
    expect(() => lerCsv("a,b,c\n1,2,3")).toThrow(/colunas/);
  });

  it("parcelas se ligam por nome e valor; as que vieram juntas contam pela maior", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "paga", faturaRef: "2026-10" });
    const lavagem = p.itens.filter((i) => i.nome === "Lavagem");
    expect(lavagem.map((i) => i.parcela_num)).toEqual([6, 7, 8, 9, 10, 11, 12]);
    expect(p.itens.filter((i) => i.nome === "Latam Air").map((i) => i.fatura_ref)).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("compra avulsa leva a data na chave: mesmo valor em outro mês não é repetição", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "aberta", faturaRef: "2026-10" });
    const postos = p.itens.filter((i) => i.nome === "Posto").map((i) => i.chave);
    expect(postos).toEqual(["csv|2026-09-16|Posto|81.00", "csv|2026-09-16|Posto|81.00#2"]);
    const outroMes = lerCsv("date,title,amount\n2026-10-16,Posto,\"81,00\"");
    expect(planejarImportacao(outroMes, { diaVencimento: 2, modo: "aberta" }).itens[0].chave).toBe("csv|2026-10-16|Posto|81.00");
  });

  it("sem período no arquivo, a fatura sai da última data", () => {
    expect(planejarImportacao(f, { diaVencimento: 2, modo: "paga" }).faturaRef).toBe("2026-10");
  });
});

describe("mês pelo nome do arquivo", () => {
  it("usa a data do vencimento no nome", () => {
    expect(refDoNomeDoArquivo("Nubank_2026-10-02.csv")).toBe("2026-10");
    expect(refDoNomeDoArquivo("fatura.ofx")).toBeNull();
  });
});

describe("descontos e estornos do banco", () => {
  it("OFX: o desconto abate as compras de mesmo código, repartido pelo peso de cada uma", () => {
    const p = planejarImportacao(lerOfx(OFX), { diaVencimento: 2, modo: "aberta" });
    const curso = p.itens.filter((i) => i.nome === "Curso Online" && i.origem === "fatura");
    expect(curso).toHaveLength(3);
    expect(curso.reduce((s, i) => s + i.valor, 0)).toBeCloseTo(3 * 30.72 - 13.75, 2);
    expect(curso.every((i) => i.abatido! > 0 && i.valor < 30.72)).toBe(true);
    expect(p.abatimentos).toEqual([{ descricao: "Desconto Antecipação Curso Online", valor: 13.75, aplicado: 13.75, linhas: 3 }]);
  });

  it("CSV: acha a compra pelo nome depois de tirar 'Desconto Antecipação' ou 'Estorno'", () => {
    const csv = lerCsv(
      ["date,title,amount", '2026-08-26,Lavagem - Parcela 3/12,"100,00"', '2026-08-26,Lavagem - Parcela 4/12,"100,00"', '2026-08-26,Desconto Antecipação Lavagem,"- 20,00"', '2026-09-02,Loja Y,"50,00"', '2026-09-03,Estorno de Loja Y,"- 50,00"', '2026-09-04,Estorno Sem Dono,"- 9,00"'].join("\n")
    );
    const p = planejarImportacao(csv, { diaVencimento: 2, modo: "aberta", faturaRef: "2026-10" });
    const doArquivo = p.itens.filter((i) => i.origem === "fatura");
    expect(doArquivo.filter((i) => i.nome === "Lavagem").map((i) => i.valor)).toEqual([90, 90]);
    expect(doArquivo.find((i) => i.nome === "Loja Y")!.valor).toBe(0.01); // estorno total nunca zera a linha
    expect(p.abatimentos.find((a) => a.descricao === "Estorno Sem Dono")).toMatchObject({ aplicado: 0, linhas: 0 });
  });

  it("fatura já paga não abate nada (só cria parcelas futuras com valor cheio)", () => {
    const p = planejarImportacao(lerOfx(OFX), { diaVencimento: 2, modo: "paga" });
    expect(p.abatimentos).toEqual([]);
    expect(p.itens.find((i) => i.nome === "Lavagem")!.valor).toBe(125.83);
  });
});

describe("pagamentos feitos no banco", () => {
  const f = lerOfx(OFX); // um pagamento de R$ 1.000 em 19/09/2026

  it("só registra a partir da data de corte", () => {
    const sem = planejarImportacao(f, { diaVencimento: 2, modo: "aberta", pagamentosDesde: "2026-10-18" });
    expect(sem.pagamentosARegistrar).toEqual({ qtd: 0, total: 0 });
    expect(sem.itens.some((i) => i.tipo === "pagamento")).toBe(false);
    const com = planejarImportacao(f, { diaVencimento: 2, modo: "aberta", pagamentosDesde: "2026-09-01" });
    expect(com.pagamentosARegistrar).toEqual({ qtd: 1, total: 1000 });
    expect(com.itens.find((i) => i.tipo === "pagamento")).toMatchObject({ valor: 1000, descricao: "Pagamento de fatura", chave: "g1|pag|1000.00" });
  });

  it("pagamento até o vencimento anterior paga a fatura anterior; depois, esta", () => {
    // fatura de outubro (vence dia 2); a anterior venceu em 02/09
    const csv = lerCsv(["date,title,amount", '2026-09-01,Pagamento recebido,"- 50,00"', '2026-09-02,Pagamento recebido,"- 60,00"', '2026-09-03,Pagamento recebido,"- 70,00"', '2026-09-04,Loja,"10,00"'].join("\n"));
    const p = planejarImportacao(csv, { diaVencimento: 2, modo: "aberta", faturaRef: "2026-10", pagamentosDesde: "2026-01-01" });
    const refs = p.itens.filter((i) => i.tipo === "pagamento").map((i) => `${i.data}:${i.fatura_ref}`);
    expect(refs).toEqual(["2026-09-01:2026-09", "2026-09-02:2026-09", "2026-09-03:2026-10"]);
  });

  it("sem data de corte, nenhum pagamento é registrado", () => {
    const p = planejarImportacao(f, { diaVencimento: 2, modo: "aberta", pagamentosDesde: null });
    expect(p.pagamentosARegistrar.qtd).toBe(0);
  });
});

describe("agrupar importações", () => {
  const l = (t: string, amount: number, ref: string, mov: "compra" | "pagamento" = "compra") => ({ created_at: t, amount, fatura_ref: ref, cartao_mov: mov });

  it("lotes próximos são uma importação; mais de 10 minutos separa", () => {
    const s = agruparImportacoes([
      l("2026-10-17T22:13:44.100Z", 10, "2026-11"),
      l("2026-10-17T22:13:44.100Z", 20, "2026-12"),
      l("2026-10-17T22:16:21.500Z", 5, "2026-11", "pagamento"),
      l("2026-10-18T10:00:00.000Z", 7, "2027-01"),
    ]);
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ lancamentos: 1, total: 7, pagamentos: 0, faturaDe: "2027-01" });
    expect(s[1]).toMatchObject({ lancamentos: 2, total: 30, pagamentos: 1, faturaDe: "2026-11", faturaAte: "2026-12" });
  });

  it("a janela leva 1 segundo de folga dos dois lados", () => {
    const [s] = agruparImportacoes([l("2026-10-17T22:13:44.100Z", 10, "2026-11")]);
    expect(s.desde).toBe("2026-10-17T22:13:43.100Z");
    expect(s.ate).toBe("2026-10-17T22:13:45.100Z");
  });
});

// ---------------------------------------------------------------------------
// Melhorias de 31/10/2026. Trecho da fatura real do Nubank de outubro/2026
// (rotativo: valor pendente 2.608,30, juros 69,43, IOF 12,11, pagamento 3.500,00 em 07/09).
const blocoReal = (tipo: string, data: string, valor: string, fitid: string, memo: string) =>
  `<STMTTRN>\n<TRNTYPE>${tipo}</TRNTYPE>\n<DTPOSTED>${data}000000[-3:BRT]</DTPOSTED>\n<TRNAMT>${valor}</TRNAMT>\n<FITID>${fitid}</FITID>\n<MEMO>${memo}</MEMO>\n</STMTTRN>\n`;
const OFX_REAL =
  `OFXHEADER:100\n<OFX>\n<BANKTRANLIST>\n<DTSTART>20260826000000[-3:BRT]</DTSTART>\n<DTEND>20260925000000[-3:BRT]</DTEND>\n` +
  blocoReal("DEBIT", "20260923", "-619.27", "6ab2a7af-7d00-462c-bcb1-c082dedb8c56", "Facebk *X8l2d76pt4") +
  blocoReal("DEBIT", "20260913", "-33.77", "6aa563b9-1e67-4495-b72d-8135e0bfbf9c", "Mercadolivre*Mercadol - Parcela 1/4") +
  blocoReal("DEBIT", "20260910", "-500.96", "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20", "Contourline Equipament - Parcela 1/9") +
  blocoReal("CREDIT", "20260907", "3500.00", "6a9efd14-db60-4ab5-9229-779323ade017", "Pagamento recebido") +
  blocoReal("DEBIT", "20260907", "-69.43", "6a9c85c0-fbfb-4066-9c5f-72e2b852d768", "Juros de pagamento parcial da fatura (rotativo)") +
  blocoReal("DEBIT", "20260907", "-12.11", "6a9c85c0-fbfb-4066-9c5f-72e2b852d768", "IOF de pagamento parcial da fatura (rotativo)") +
  blocoReal("DEBIT", "20260902", "-360.00", "6a97636a-d535-482b-b1b7-f4917c915cd3", "HOTEL PATOS") +
  blocoReal("DEBIT", "20260902", "-2608.30", "6a9c85c0-fbfb-4066-9c5f-72e2b852d768", "Valor pendente do mês anterior (rotativo)") +
  blocoReal("DEBIT", "20260826", "-133.33", "6a6e8880-9fa8-42ee-b234-d03887d4710d", "Posto - Parcela 2/3") +
  blocoReal("DEBIT", "20260826", "-66.66", "6a8ba684-6b18-484a-88d1-10011f69bcea", "Posto - Parcela 2/3") +
  blocoReal("DEBIT", "20260826", "-100.56", "6941da21-8c1b-4e24-863e-c6b14ab52853", "Ferreira Costa - TINTAS - Parcela 10/10") +
  blocoReal("DEBIT", "20260826", "-207.08", "6a41c45c-bc04-41b0-a850-b17ae1475117", "NOBREAK HIPRO - Parcela 3/10") +
  `</BANKTRANLIST>\n<LEDGERBAL>\n<BALAMT>-6123.74</BALAMT>\n</LEDGERBAL>\n</OFX>`;

// Chaves geradas pelo código de antes destas mudanças (congeladas): não podem mudar,
// porque já existem lançamentos gravados com elas.
const CHAVES_OFX_ANTES = [
  "6ab2a7af-7d00-462c-bcb1-c082dedb8c56|Facebk *X8l2d76pt4|619.27",
  "6aa563b9-1e67-4495-b72d-8135e0bfbf9c|p1/4",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p1/9",
  "6a9c85c0-fbfb-4066-9c5f-72e2b852d768|Juros de pagamento parcial da fatura (rotativo)|69.43",
  "6a9c85c0-fbfb-4066-9c5f-72e2b852d768|IOF de pagamento parcial da fatura (rotativo)|12.11",
  "6a97636a-d535-482b-b1b7-f4917c915cd3|HOTEL PATOS|360.00",
  "6a9c85c0-fbfb-4066-9c5f-72e2b852d768|Valor pendente do m\u00eas anterior (rotativo)|2608.30",
  "6a6e8880-9fa8-42ee-b234-d03887d4710d|p2/3",
  "6a8ba684-6b18-484a-88d1-10011f69bcea|p2/3",
  "6941da21-8c1b-4e24-863e-c6b14ab52853|p10/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p3/10",
  "6aa563b9-1e67-4495-b72d-8135e0bfbf9c|p2/4",
  "6aa563b9-1e67-4495-b72d-8135e0bfbf9c|p3/4",
  "6aa563b9-1e67-4495-b72d-8135e0bfbf9c|p4/4",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p2/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p3/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p4/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p5/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p6/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p7/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p8/9",
  "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p9/9",
  "6a6e8880-9fa8-42ee-b234-d03887d4710d|p3/3",
  "6a8ba684-6b18-484a-88d1-10011f69bcea|p3/3",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p4/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p5/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p6/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p7/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p8/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p9/10",
  "6a41c45c-bc04-41b0-a850-b17ae1475117|p10/10",
  "6a9efd14-db60-4ab5-9229-779323ade017|pag|3500.00"
];
const PAGAMENTO_ANTES = "6a9efd14-db60-4ab5-9229-779323ade017|pag|3500.00";
const PENDENTE_ANTES = "6a9c85c0-fbfb-4066-9c5f-72e2b852d768|Valor pendente do mês anterior (rotativo)|2608.30";

const CSV_CHAVES = [
  "date,title,amount",
  '2026-09-24,Lojas Americanas,"43,74"',
  '2026-09-19,Pagamento recebido,"- 1.000,00"',
  '2026-09-05,"IOF de ""Anthropic""","3,73"',
  '2026-08-26,Latam Air - Parcela 1/4,"1.573,84"',
  '2026-08-26,Lavagem - Parcela 3/12,"125,83"',
  '2026-09-16,Posto,"81,00"',
  '2026-09-16,Posto,"81,00"',
].join("\n");
const CHAVES_CSV_ANTES = [
  "csv|2026-09-24|Lojas Americanas|43.74",
  "csv|2026-09-05|IOF de \"Anthropic\"|3.73",
  "csv|Latam Air|1573.84|p1/4",
  "csv|Lavagem|125.83|p3/12",
  "csv|2026-09-16|Posto|81.00",
  "csv|2026-09-16|Posto|81.00#2",
  "csv|Latam Air|1573.84|p2/4",
  "csv|Latam Air|1573.84|p3/4",
  "csv|Latam Air|1573.84|p4/4",
  "csv|Lavagem|125.83|p4/12",
  "csv|Lavagem|125.83|p5/12",
  "csv|Lavagem|125.83|p6/12",
  "csv|Lavagem|125.83|p7/12",
  "csv|Lavagem|125.83|p8/12",
  "csv|Lavagem|125.83|p9/12",
  "csv|Lavagem|125.83|p10/12",
  "csv|Lavagem|125.83|p11/12",
  "csv|Lavagem|125.83|p12/12",
  "csv|pag|2026-09-19|1000.00"
];

const opcoesReal = { diaVencimento: 2, modo: "aberta" as const, faturaRef: "2026-10", pagamentosDesde: "2026-01-01" };

describe("chaves de importação não mudam", () => {
  it("OFX: as mesmas de antes (menos o valor pendente, que deixou de ser compra, e o pagamento dividido)", () => {
    const chaves = planejarImportacao(lerOfx(OFX_REAL), opcoesReal).itens.map((i) => i.chave);
    const esperadas = CHAVES_OFX_ANTES.filter((c) => c !== PENDENTE_ANTES && c !== PAGAMENTO_ANTES);
    expect(chaves.filter((c) => !c.includes("|pag|"))).toEqual(esperadas);
    expect(chaves.filter((c) => c.includes("|pag|"))).toEqual([`${PAGAMENTO_ANTES}|parte1`, `${PAGAMENTO_ANTES}|parte2`]);
  });

  it("OFX sem rotativo: o pagamento mantém a chave de hoje", () => {
    const semPendente = OFX_REAL.replace(/<STMTTRN>(?:(?!<\/STMTTRN>)[\s\S])*Valor pendente[\s\S]*?<\/STMTTRN>\n/, "");
    const chaves = planejarImportacao(lerOfx(semPendente), opcoesReal).itens.map((i) => i.chave);
    expect(chaves.filter((c) => c.includes("|pag|"))).toEqual([PAGAMENTO_ANTES]);
  });

  it("CSV: as mesmas de antes", () => {
    const chaves = planejarImportacao(lerCsv(CSV_CHAVES), opcoesReal).itens.map((i) => i.chave);
    expect(chaves).toEqual(CHAVES_CSV_ANTES);
  });

  it("chave do pagamento com '#2' só conta os que vão ser registrados (igual a antes)", () => {
    const csv = lerCsv(["date,title,amount", '2026-09-19,Pagamento recebido,"- 100,00"', '2026-09-19,Pagamento recebido,"- 100,00"'].join("\n"));
    const p = planejarImportacao(csv, { diaVencimento: 2, modo: "aberta", faturaRef: "2026-10", pagamentosDesde: "2026-09-01" });
    expect(p.itens.map((i) => i.chave)).toEqual(["csv|pag|2026-09-19|100.00", "csv|pag|2026-09-19|100.00#2"]);
  });
});

describe("rotativo e encargos", () => {
  const p = planejarImportacao(lerOfx(OFX_REAL), opcoesReal);

  it("o valor pendente do mês anterior não vira compra", () => {
    expect(ehValorPendente("Valor pendente do mês anterior (rotativo)")).toBe(true);
    expect(p.itens.some((i) => i.descricao.startsWith("Valor pendente"))).toBe(false);
  });

  it("juros e IOF do rotativo são encargos, com chaves distintas mesmo com o mesmo código", () => {
    const enc = p.itens.filter((i) => i.encargo);
    expect(enc.map((i) => i.valor)).toEqual([69.43, 12.11]);
    expect(new Set(enc.map((i) => i.chave)).size).toBe(2);
    expect(ehEncargo("IOF de \"Anthropic\"")).toBe(false); // IOF de compra internacional é da compra
    expect(ehEncargo("Multa por atraso")).toBe(true);
    expect(ehEncargo("Encargos de parcelamento da fatura")).toBe(true);
  });

  it("encargo sugere 'Juros e encargos do cartão' só se a categoria existir", () => {
    const comCat = [{ id: "j", name: "Juros e encargos do cartão" }, { id: "s", name: "Serviços" }];
    expect(sugerirCategoria("Juros de pagamento parcial da fatura (rotativo)", comCat)).toBe("j");
    expect(sugerirCategoria("IOF de pagamento parcial da fatura (rotativo)", comCat)).toBe("j");
    expect(sugerirCategoria("Juros de pagamento parcial da fatura (rotativo)", [{ id: "s", name: "Serviços" }])).toBe("");
  });

  it("o pagamento quita primeiro o pendente (fatura anterior) e o resto fica nesta", () => {
    const pags = p.itens.filter((i) => i.tipo === "pagamento").map((i) => [i.fatura_ref, i.valor, i.data]);
    expect(pags).toEqual([
      ["2026-09", 2608.3, "2026-09-07"],
      ["2026-10", 891.7, "2026-09-07"],
    ]);
    expect(p.rotativo).toEqual({ pendente: 2608.3, quitado: 2608.3, refAnterior: "2026-09", encargos: 81.54 });
    expect(p.pagamentosARegistrar).toEqual({ qtd: 1, total: 3500 });
  });

  it("pagamento menor que o pendente vai inteiro para a fatura anterior, sem dividir; o seguinte quita o resto", () => {
    const ofx = OFX_REAL.replace("<TRNAMT>3500.00</TRNAMT>", "<TRNAMT>1000.00</TRNAMT>").replace(
      "</BANKTRANLIST>",
      blocoReal("CREDIT", "20260915", "2000.00", "pag2", "Pagamento recebido") + "</BANKTRANLIST>"
    );
    const q = planejarImportacao(lerOfx(ofx), opcoesReal);
    expect(q.itens.filter((i) => i.tipo === "pagamento").map((i) => [i.chave, i.fatura_ref, i.valor])).toEqual([
      ["6a9efd14-db60-4ab5-9229-779323ade017|pag|1000.00", "2026-09", 1000],
      ["pag2|pag|2000.00|parte1", "2026-09", 1608.3],
      ["pag2|pag|2000.00|parte2", "2026-10", 391.7],
    ]);
  });

  it("pagamento antes da data de corte quita o pendente mas não é registrado", () => {
    const q = planejarImportacao(lerOfx(OFX_REAL), { ...opcoesReal, pagamentosDesde: "2026-09-08" });
    expect(q.itens.some((i) => i.tipo === "pagamento")).toBe(false);
    expect(q.rotativo?.quitado).toBe(2608.3);
  });
});

describe("categoria sugerida: novas palavras", () => {
  const cats = [
    { id: "mk", name: "Marketing" },
    { id: "tr", name: "Transporte" },
    { id: "mo", name: "Manutenção e obras" },
    { id: "ho", name: "Hospedagem" },
    { id: "pe", name: "Parcela de equipamento" },
    { id: "al", name: "Alimentação" },
    { id: "me", name: "Mercado" },
    { id: "as", name: "Assinaturas" },
  ];
  it.each([
    ["Facebk *X8l2d76pt4", "mk"],
    ["Facebook Ads", "mk"],
    ["Meta Platforms", "mk"],
    ["Rd Station", "mk"],
    ["Google Ads", "mk"],
    ["Dm*Hostingercomb", "mk"],
    ["Jim.Com* Publigyn", "mk"],
    ["Unidas Locado Aprx", "tr"],
    ["Localiza", "tr"],
    ["Movida", "tr"],
    ["Uber *Trip", "tr"],
    ["99 Pop", "tr"],
    ["Ferreira Costa - TINTAS", "mo"],
    ["MATERIAIS BANHEIRO CLÍNICA", "mo"],
    ["TORNEIRA BANHEIRO CLÍNICA JP", "mo"],
    ["Nordife", "mo"],
    ["Leroy Merlin", "mo"],
    ["HOTEL PATOS", "ho"],
    ["Booking.com", "ho"],
    ["Pousada do Sol", "ho"],
    ["Contourline Equipament", "pe"],
    ["NOBREAK HIPRO", "pe"],
    ["Supermercado Bem Mais", "me"],
    ["Mercado São Luiz", "me"],
  ])("%s", (nome, id) => {
    expect(sugerirCategoria(nome, cats)).toBe(id);
  });

  it("Mercado Livre não é Mercado nem Alimentação: fica sem sugestão", () => {
    expect(sugerirCategoria("Mercadolivre*Mercadol", cats)).toBe("");
    expect(sugerirCategoria("Mercado Livre", cats)).toBe("");
    expect(sugerirCategoria("MERCADOLIVRE", cats)).toBe("");
  });

  it("sem a categoria no banco, não sugere", () => {
    expect(sugerirCategoria("Facebk *X8l2d76pt4", [{ id: "al", name: "Alimentação" }])).toBe("");
    expect(sugerirCategoria("NOBREAK HIPRO", [{ id: "al", name: "Alimentação" }])).toBe("");
  });
});

describe("linhas reais e futuras; o que já está lançado", () => {
  const p = planejarImportacao(lerOfx(OFX_REAL), opcoesReal);
  const item = (chave: string) => p.itens.find((i) => i.chave === chave)!;
  const contour2 = "6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p2/9";

  it("as linhas do arquivo são 'fatura' (reais) e as parcelas que faltam são 'futura'", () => {
    expect(item("6aa1b0f3-ef87-45a9-82e5-0dd8d5d84f20|p1/9").origem).toBe("fatura");
    expect(item(contour2).origem).toBe("futura");
    expect(p.itens.filter((i) => i.tipo === "pagamento").every((i) => i.origem === "fatura")).toBe(true);
  });

  it("fatura real manda: parcela já lançada nesta fatura com outro valor é atualizada", () => {
    // Contourline 2/9 criada como futura com 500,96; a fatura de novembro traz 500,88.
    const nov = planejarImportacao(
      lerOfx(OFX_REAL.replace("<TRNAMT>-500.96</TRNAMT>", "<TRNAMT>-500.88</TRNAMT>").replace("Parcela 1/9", "Parcela 2/9")),
      { ...opcoesReal, faturaRef: "2026-11" }
    );
    const real = nov.itens.find((i) => i.chave === contour2)!;
    expect(real.origem).toBe("fatura");
    const existentes = new Map<string, LancadaNoCartao>([
      [contour2, { fatura_ref: "2026-11", amount: 500.96, description: "Contourline Equipament (2/9)", data_compra: "2026-10-10" }],
    ]);
    expect(situacaoDoItem(real, existentes, [])).toBe("atualizar");
    // Igual em tudo: repetida.
    existentes.set(contour2, { fatura_ref: "2026-11", amount: 500.88, description: real.descricao, data_compra: real.data });
    expect(situacaoDoItem(real, existentes, [])).toBe("repetida");
  });

  it("parcela futura gerada nunca sobrescreve a existente; antecipada é movida", () => {
    const futura = item(contour2); // fatura 2026-11
    const existentes = new Map<string, LancadaNoCartao>([[contour2, { fatura_ref: "2026-11", amount: 1, description: "outro nome", data_compra: "2026-01-01" }]]);
    expect(situacaoDoItem(futura, existentes, [])).toBe("repetida");
    existentes.set(contour2, { fatura_ref: "2026-12", amount: 1, description: "x", data_compra: null });
    expect(situacaoDoItem(futura, existentes, [])).toBe("antecipada");
    expect(situacaoDoItem(futura, new Map(), [])).toBe("nova");
  });

  it("pagamento com a mesma data e valor de um já lançado (até o manual) fica de fora", () => {
    const pag = (chave: string, data: string, valor: number) =>
      ({ chave, data, valor, grupo: "pagamento", descricao: "Pagamento de fatura", nome: "Pagamento de fatura", fatura_ref: "2026-12", parcela_num: null, parcelas_total: null, origem: "fatura", tipo: "pagamento" }) as ItemImportacao;
    const manual = [{ date: "2026-10-31", amount: 5795.02, importacao_chave: "manual|pag|2026-10-31|5795.02" }];
    const doExtrato = pag("abc|pag|5795.02", "2026-10-31", 5795.02);
    expect(pagamentoJaLancado(doExtrato, manual)).toBe(true);
    expect(situacaoDoItem(doExtrato, new Map(), manual)).toBe("pagamento_lancado");
    // Pago pelo "Pagar fatura" sem chave nenhuma.
    expect(pagamentoJaLancado(doExtrato, [{ date: "2026-10-31", amount: 5795.02, importacao_chave: null }])).toBe(true);
    // Outro dia ou outro valor: entra.
    expect(pagamentoJaLancado(pag("abc|pag|5795.02", "2026-11-01", 5795.02), manual)).toBe(false);
    expect(pagamentoJaLancado(pag("abc|pag|5795.00", "2026-10-31", 5795), manual)).toBe(false);
    // Dois pagamentos iguais no mesmo dia do mesmo arquivo (#2) não se anulam.
    expect(pagamentoJaLancado(pag("csv|pag|2026-10-31|10.00#2", "2026-10-31", 10), [{ date: "2026-10-31", amount: 10, importacao_chave: "csv|pag|2026-10-31|10.00" }])).toBe(false);
  });

  it("pagamento já lançado inteiro com a chave de antes não volta dividido", () => {
    const partes = p.itens.filter((i) => i.tipo === "pagamento");
    const antigo = [{ date: "2026-09-07", amount: 3500, importacao_chave: PAGAMENTO_ANTES }];
    expect(partes.every((i) => pagamentoJaLancado(i, antigo))).toBe(true);
  });
});
