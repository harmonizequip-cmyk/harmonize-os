// Partes do contrato de locação que vêm de Configurações (dados da Harmonize e
// números das cláusulas). O texto jurídico continua fixo em lib/contrato-pdf.tsx;
// aqui só se interpolam os números, com o mesmo formato de sempre
// ("20% (vinte por cento)", "48 (quarenta e oito) horas").
//
// O contrato guarda um retrato desses valores em contratos_emitidos.dados, para
// "baixar de novo" sair igual mesmo que Configurações mude depois. Contrato
// antigo, sem o retrato, usa os padrões, que são exatamente os textos de antes.

import { DEFAULT_PREFERENCIAS, type Preferencias } from "./preferencias";

export type DadosContratado = Pick<
  Preferencias["empresa"],
  "razaoSocial" | "cnpj" | "endereco" | "responsavel" | "email" | "cidadeForo"
>;
export type TermosContrato = Preferencias["contrato"];

const UNIDADES = ["zero", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = ["dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

function ate999(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DEZ_A_DEZENOVE[n - 10];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d];
  }
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto ? `${CENTENAS[c]} e ${ate999(resto)}` : CENTENAS[c];
}

/** Número inteiro de 0 a 999.999 por extenso, em português ("quarenta e oito"). */
export function numeroPorExtenso(n: number): string {
  const v = Math.max(0, Math.min(999999, Math.round(n)));
  if (v < 1000) return ate999(v);
  const mil = Math.floor(v / 1000);
  const resto = v % 1000;
  const parteMil = mil === 1 ? "mil" : `${ate999(mil)} mil`;
  if (!resto) return parteMil;
  // "mil e quinhentos", "mil e vinte", mas "mil duzentos e trinta".
  const liga = resto < 100 || resto % 100 === 0 ? " e " : " ";
  return `${parteMil}${liga}${ate999(resto)}`;
}

/** Dados do contratado: o retrato salvo no contrato, completando o que faltar com o padrão. */
export function contratadoDoContrato(retrato?: Partial<DadosContratado> | null): DadosContratado {
  const d = DEFAULT_PREFERENCIAS.empresa;
  const r = retrato ?? {};
  const t = (v: unknown, padrao: string) => (typeof v === "string" && v.trim() ? v : padrao);
  return {
    razaoSocial: t(r.razaoSocial, d.razaoSocial),
    cnpj: t(r.cnpj, d.cnpj),
    endereco: t(r.endereco, d.endereco),
    responsavel: t(r.responsavel, d.responsavel),
    email: t(r.email, d.email),
    cidadeForo: t(r.cidadeForo, d.cidadeForo),
  };
}

/** Números das cláusulas: o retrato salvo no contrato ou o padrão. */
export function termosDoContrato(retrato?: Partial<TermosContrato> | null): TermosContrato {
  const d = DEFAULT_PREFERENCIAS.contrato;
  const r = retrato ?? {};
  const n = (v: unknown, padrao: number) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : padrao);
  return {
    multaPercentual: n(r.multaPercentual, d.multaPercentual),
    avisoRescisaoHoras: n(r.avisoRescisaoHoras, d.avisoRescisaoHoras) || d.avisoRescisaoHoras,
  };
}

/** Texto da 6ª cláusula (penalidades). */
export function textoPenalidades(t: TermosContrato = DEFAULT_PREFERENCIAS.contrato): string {
  const p = t.multaPercentual;
  return (
    "Em caso de descumprimento de quaisquer obrigações previstas neste instrumento, a parte infratora ficará " +
    `sujeita a: (a) multa de ${p}% (${numeroPorExtenso(p)} por cento) sobre o valor total do contrato; (b) responsabilidade integral ` +
    "pelos danos causados, sem prejuízo das demais cominações legais."
  );
}

/** Texto da 7ª cláusula (rescisão). */
export function textoRescisao(t: TermosContrato = DEFAULT_PREFERENCIAS.contrato): string {
  const h = t.avisoRescisaoHoras;
  return (
    `O presente contrato poderá ser rescindido por qualquer das partes mediante comunicação prévia de ${h} ` +
    `(${numeroPorExtenso(h)}) ${h === 1 ? "hora" : "horas"}, respondendo a parte que der causa à rescisão pelas perdas e danos decorrentes.`
  );
}
