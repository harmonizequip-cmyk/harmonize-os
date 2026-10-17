import { describe, it, expect } from "vitest";
import { calculateMentoriaValue, calculateRentalValue, DEFAULT_PRICING } from "./rental-pricing";
import { calcularResumoLocacao } from "./rental-calculator";
import { descreverFaixa, montarAjustes, montarDadosCalculo, montarDadosMentoria, reais } from "./calculo-image";
import { disparosQueViramCredito, linhasRecibo, separarLinhaFaixa } from "./calculo-image";

describe("tabela de preços do HIPRO", () => {
  it("pacote fixo, excedente a 0,10 e, acima de 80.000, 0,07 sobre o total", () => {
    expect(calculateRentalValue(15_000, DEFAULT_PRICING).totalValue).toBe(2500);
    expect(calculateRentalValue(50_000, DEFAULT_PRICING).totalValue).toBe(5500);
    expect(calculateRentalValue(80_000, DEFAULT_PRICING).totalValue).toBe(8500);
    const p = calculateRentalValue(90_000, DEFAULT_PRICING);
    expect(p.totalValue).toBe(6300);
    expect(p.flatPackageValue).toBe(0);
    expect(p.tier3Portion).toBe(90_000);
  });
});

describe("faixa aplicada na imagem do cálculo", () => {
  it("acima da faixa 2 descreve a faixa 3: taxa sobre o total, sem pacote fixo", () => {
    const pricing = calculateRentalValue(80_163, DEFAULT_PRICING);
    const f = descreverFaixa(pricing, null, 80_163);
    expect(f.faixaTitulo).toBe("FAIXA 3 APLICADA");
    expect(f.faixaSubtitulo).toBe("Acima de 80.000 disparos, sobre o total");
    expect(f.faixaChip).toBe("R$ 0,07");
    expect(f.faixaLinhas).toEqual([`80.163 disparos x R$ 0,07 = ${reais(5611.41)}`]);
    expect(f.valorDisparos).toBe(5611.41);
  });

  it("na faixa 2 mostra o intervalo e o excedente", () => {
    const pricing = calculateRentalValue(50_000, DEFAULT_PRICING);
    const f = descreverFaixa(pricing, null, 50_000);
    expect(f.faixaTitulo).toBe("FAIXA 2 APLICADA");
    expect(f.faixaSubtitulo).toBe("De 20.001 a 80.000 disparos");
    expect(f.faixaChip).toBe("R$ 0,10");
  });

  it("dentro do pacote mostra só o pacote fixo", () => {
    const pricing = calculateRentalValue(15_000, DEFAULT_PRICING);
    const f = descreverFaixa(pricing, null, 15_000);
    expect(f.faixaTitulo).toBe("PACOTE FIXO");
    expect(f.valorDisparos).toBe(2500);
  });

  it("com custo por disparo negociado calcula só disparos x custo e mostra a economia", () => {
    const pricing = calculateRentalValue(80_163, DEFAULT_PRICING);
    const f = descreverFaixa(pricing, 0.05, 80_163);
    expect(f.faixaTitulo).toBe("CUSTO NEGOCIADO");
    expect(f.valorDisparos).toBe(4008.15);
    expect(f.faixaLinhas[0]).toBe("80.163 disparos x R$ 0,05 = R$ 4.008,15");
    expect(f.faixaLinhas[1]).toContain("economia");
  });
});

describe("ajustes e total da imagem do cálculo", () => {
  const base = {
    isMentoria: false,
    shots: 80_163,
    pricing: calculateRentalValue(80_163, DEFAULT_PRICING),
    custoManualPorDisparo: null,
    mentoriaPricing: null,
    kmIda: 0,
    reservationFeeStatus: "nao_aplica" as const,
    reservationFee: 250,
  };

  it("aluguel e desconto percentual aparecem como no cartão da tela", () => {
    const itens = [
      { id: "aluguel", desc: "Aluguel", valor: 497, tipo: "mais" as const },
      { id: "desconto", desc: "15% de desconto", valor: 1037, tipo: "menos" as const },
    ];
    const resumo = calcularResumoLocacao({ ...base, itens });
    const a = montarAjustes({ itens, descontoPercentual: 15, kmIda: 0, resumo });
    expect(a).toEqual([
      { rotulo: "Aluguel do equipamento", valor: "R$ 497,00", tom: "mais" },
      { rotulo: "Desconto aplicado", valor: "-15% = R$ 1.037,00", tom: "menos" },
    ]);
  });

  it("o total da imagem é o total a pagar do resumo, com taxa agora explicada", () => {
    const resumo = calcularResumoLocacao({ ...base, itens: [], reservationFeeStatus: "cobrar_agora" });
    const d = montarDadosCalculo({
      cliente: "DRA. TESTE",
      dataEvento: "2026-10-20",
      contagemInicial: 7_000,
      contagemFinal: 87_163,
      disparos: 80_163,
      pricing: base.pricing,
      custoManualPorDisparo: null,
      itens: [],
      descontoPercentual: null,
      kmIda: 0,
      resumo,
    });
    expect(d.total).toBe(resumo.totalAPagarAgora);
    expect(d.observacaoTotal).toContain("R$ 250,00");
  });

  it("deslocamento e taxa já paga entram nos ajustes", () => {
    const resumo = calcularResumoLocacao({ ...base, itens: [], kmIda: 50, reservationFeeStatus: "ja_paga" });
    const a = montarAjustes({ itens: [], descontoPercentual: null, kmIda: 50, resumo });
    expect(a.map((x) => x.rotulo)).toEqual(["Deslocamento (50 km de ida)", "Taxa de reserva já paga (crédito)"]);
    expect(a[1].valor).toBe("-R$ 250,00");
  });
});

describe("imagem da mentoria", () => {
  it("mostra pacientes x valor por paciente e o total a pagar do resumo", () => {
    const mentoria = calculateMentoriaValue(3, "pix");
    const resumo = calcularResumoLocacao({
      isMentoria: true,
      shots: 0,
      pricing: null,
      custoManualPorDisparo: null,
      mentoriaPricing: mentoria,
      kmIda: 0,
      itens: [],
      reservationFeeStatus: "nao_aplica",
      reservationFee: 250,
    });
    const d = montarDadosMentoria({
      cliente: "DRA. TESTE",
      dataEvento: "2026-10-20",
      mentoria,
      itens: [],
      descontoPercentual: null,
      kmIda: 0,
      resumo,
    });
    expect(d.modo).toBe("mentoria");
    expect(d.disparos).toBe(3);
    expect(d.valorDisparos).toBe(mentoria.totalValue);
    expect(d.faixaSubtitulo).toBe("À vista");
    expect(d.faixaLinhas[0]).toBe(`3 paciente(s) x ${reais(mentoria.unitValue)} = ${reais(mentoria.totalValue)}`);
    expect(d.total).toBe(resumo.totalAPagarAgora);
  });

  it("no crédito usa o valor parcelado e avisa as 10x", () => {
    const mentoria = calculateMentoriaValue(2, "credito");
    expect(mentoria.isParcelado).toBe(true);
  });
});

describe("imagem do cálculo com várias contagens e crédito", () => {
  const base = {
    isMentoria: false,
    custoManualPorDisparo: null,
    mentoriaPricing: null,
    kmIda: 0,
    itens: [],
    reservationFeeStatus: "nao_aplica" as const,
    reservationFee: 250,
  };

  it("sem dados novos sai igual a antes", () => {
    const pricing = calculateRentalValue(15_000, DEFAULT_PRICING);
    const resumo = calcularResumoLocacao({ ...base, shots: 15_000, pricing });
    const d = montarDadosCalculo({
      cliente: "DRA. TESTE",
      dataEvento: "2026-10-20",
      contagemInicial: 1_000,
      contagemFinal: 16_000,
      disparos: 15_000,
      pricing,
      custoManualPorDisparo: null,
      itens: [],
      descontoPercentual: null,
      kmIda: 0,
      resumo,
      contagens: [{ inicial: 1_000, final: 16_000, disparos: 15_000, viraCredito: false }],
    });
    expect(d.contagens).toBeUndefined();
    expect(d.creditoUsado).toBeUndefined();
    expect(d.disparosRealizados).toBeUndefined();
  });

  it("leva as contagens e o crédito usado", () => {
    const pricing = calculateRentalValue(12_000, DEFAULT_PRICING);
    const resumo = calcularResumoLocacao({ ...base, shots: 12_000, pricing });
    const contagens = [
      { inicial: 1_000, final: 11_000, disparos: 10_000, viraCredito: true },
      { inicial: 500, final: 7_500, disparos: 7_000, viraCredito: false },
    ];
    const d = montarDadosCalculo({
      cliente: "DRA. TESTE",
      dataEvento: "2026-10-20",
      contagemInicial: 1_000,
      contagemFinal: 7_500,
      disparos: 12_000,
      pricing,
      custoManualPorDisparo: null,
      itens: [],
      descontoPercentual: null,
      kmIda: 0,
      resumo,
      contagens,
      disparosRealizados: 17_000,
      creditoUsado: 5_000,
    });
    expect(d.contagens).toEqual(contagens);
    expect(d.creditoUsado).toBe(5_000);
    expect(d.disparosRealizados).toBe(17_000);
    expect(d.disparos).toBe(12_000);
  });

  it("tudo no crédito: imagem com valor dos disparos zero", () => {
    const resumo = calcularResumoLocacao({ ...base, shots: 0, pricing: null });
    const d = montarDadosCalculo({
      cliente: "DRA. TESTE",
      dataEvento: "2026-10-20",
      contagemInicial: 1_000,
      contagemFinal: 4_000,
      disparos: 0,
      pricing: null,
      custoManualPorDisparo: null,
      itens: [],
      descontoPercentual: null,
      kmIda: 0,
      resumo,
      disparosRealizados: 3_000,
      creditoUsado: 3_000,
    });
    expect(d.valorDisparos).toBe(0);
    expect(d.faixaTitulo).toBe("CRÉDITO DA CLIENTE");
    expect(d.faixaLinhas[0]).toBe(`3.000 disparos do crédito: ${reais(0)}`);
    expect(d.total).toBe(resumo.totalAPagarAgora);
  });
});

describe("recibo da imagem", () => {
  const base = {
    cliente: "Dra. Vânia", dataEvento: "2026-10-16", contagemInicial: 0, contagemFinal: 0, disparos: 24394,
    faixaTitulo: "FAIXA 2 APLICADA", faixaSubtitulo: "", faixaChip: "R$ 0,10",
    faixaLinhas: ["Pacote fixo (até 20.000 disparos): R$ 2.500,00", "4.394 disparos x R$ 0,10 = R$ 439,40"],
    valorDisparos: 2939.4, ajustes: [{ rotulo: "Taxa de reserva já paga (crédito)", valor: "-R$ 250,00", tom: "menos" as const }],
    total: 2689.4, observacaoTotal: null,
    contagens: [{ inicial: 7787870, final: 7796737, disparos: 8867, viraCredito: true }, { inicial: 657593, final: 673120, disparos: 15527, viraCredito: false }],
  };
  it("separa rótulo e valor das linhas da faixa", () => {
    expect(separarLinhaFaixa("4.394 disparos x R$ 0,10 = R$ 439,40")).toEqual({ rotulo: "4.394 disparos x R$ 0,10", valor: "R$ 439,40" });
    expect(separarLinhaFaixa("Pacote fixo (até 20.000 disparos): R$ 2.500,00")).toEqual({ rotulo: "Pacote fixo (até 20.000 disparos)", valor: "R$ 2.500,00" });
  });
  it("monta o recibo na ordem e soma o crédito gerado", () => {
    const l = linhasRecibo(base);
    expect(l.map((x) => x.rotulo)).toEqual([
      "Contagem do aparelho", "Contagem 1 · vira crédito", "Contagem 2", "Disparos realizados",
      "Faixa 2 aplicada · R$ 0,10", "Pacote fixo (até 20.000 disparos)", "4.394 disparos x R$ 0,10", "Valor dos disparos",
      "Ajustes", "Taxa de reserva já paga (crédito)", "Total a pagar",
    ]);
    expect(l[l.length - 1].valor).toBe(reais(2689.4));
    expect(disparosQueViramCredito(base)).toBe(8867);
  });
});
