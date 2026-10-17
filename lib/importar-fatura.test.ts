import { describe, expect, it } from "vitest";
import { lerCsv, lerFatura, lerOfx, planejarImportacao, refDaFatura, refDoNomeDoArquivo, somarMesesData, sugerirCategoria } from "./importar-fatura";

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
