import { describe, it, expect } from "vitest";
import { calculateMentoriaValue, calculateRentalValue, DEFAULT_PRICING } from "./rental-pricing";
import { calcularResumoLocacao } from "./rental-calculator";
import { descreverFaixa, montarAjustes, montarDadosCalculo, montarDadosMentoria, reais } from "./calculo-image";

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
