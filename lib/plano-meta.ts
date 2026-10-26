// ============================================================
// PLANO PARA BATER A META DO MÊS (pedido do dono, 26/10/2026)
//
// O destaque do mês diz quantas locações faltam para a meta; este plano diz o
// que fazer com isso: quantas datas livres ainda restam no mês, quantas delas
// estão coladas a um atendimento com gente por perto (Encaixe), quantas pessoas
// estão na hora de chamar (Relacionamento) e o ritmo que a meta pede por semana.
// Só lê o que as telas já calculam; nada é gravado. "Livre" segue a regra de
// sempre: os dois HIPROs sem reserva nem bloqueio, fora domingo.
// ============================================================

import { ehDiaLivre } from "./encaixe";
import { somarDias, ultimoDiaDoMes } from "./period";

export interface DataComGente {
  data: string;
  /** Quantas pessoas perto de onde ele estará (candidatas do Encaixe). */
  pessoas: number;
}

export interface EntradaPlanoMeta {
  hoje: string;
  metaMin: number;
  /** Locações do mês (contabilizáveis). */
  locacoes: number;
  /** Reservas do mês ainda sem disparos, que podem virar locação. */
  reservadas: number;
  /** Dias livres de amanhã até o fim do mês. */
  diasLivres: string[];
  /** Datas do Encaixe (já com gente perto); as de fora do mês são ignoradas. */
  datasComGente: DataComGente[];
  /** Pessoas na hora de chamar (Relacionamento). */
  paraChamar: number;
}

export interface PlanoMeta {
  /** Quantas locações faltam para a meta mínima. */
  faltam: number;
  reservadas: number;
  /** O que ainda falta depois das reservas virarem locação. */
  semReserva: number;
  diasLivres: number;
  datasComGente: number;
  /** Pessoas distintas não é possível contar aqui (a mesma pode estar em várias datas): soma das datas. */
  pessoasNasDatas: number;
  paraChamar: number;
  diasRestantes: number;
  /** Quantas locações por semana a meta pede dos dias que sobram (nulo se nada falta). */
  porSemana: number | null;
  /** As datas livres não bastam para fechar a meta. */
  naoCabe: boolean;
  frase: string;
  /** Primeira ação: o Encaixe quando há datas com gente perto, senão o Relacionamento. */
  principal: { rotulo: string; href: string } | null;
  secundaria: { rotulo: string; href: string } | null;
}

/** Dias livres de amanhã até `fim` (inclusive), pela regra de dia livre do Encaixe. */
export function diasLivresAte(hoje: string, fim: string, ocupados: Set<string>): string[] {
  const dias: string[] = [];
  for (let d = somarDias(hoje, 1); d <= fim; d = somarDias(d, 1)) if (ehDiaLivre(d, hoje, ocupados)) dias.push(d);
  return dias;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Devolve o plano, ou null quando a meta mínima já foi batida ou não há meta
 * (nesse caso o destaque do mês já diz tudo).
 */
export function montarPlanoMeta(e: EntradaPlanoMeta): PlanoMeta | null {
  if (!(e.metaMin > 0)) return null;
  const faltam = Math.max(0, e.metaMin - e.locacoes);
  if (faltam === 0) return null;

  const fimMes = ultimoDiaDoMes(e.hoje);
  const semReserva = Math.max(0, faltam - e.reservadas);
  const noMes = e.datasComGente.filter((d) => d.data > e.hoje && d.data <= fimMes);
  const diasRestantes = Math.max(1, Math.round((new Date(`${fimMes}T12:00:00Z`).getTime() - new Date(`${e.hoje}T12:00:00Z`).getTime()) / 86400000) + 1);
  const semanas = Math.max(1, Math.ceil(diasRestantes / 7));
  const porSemana = semReserva > 0 ? Math.ceil(semReserva / semanas) : null;
  const naoCabe = semReserva > 0 && e.diasLivres.length < semReserva;

  const partes: string[] = [`Faltam ${faltam} para a meta`];
  if (e.reservadas > 0) partes[0] += ` (${plural(e.reservadas, "já reservada", "já reservadas")})`;
  let frase = `${partes[0]}.`;
  if (semReserva === 0) {
    frase += " As reservas marcadas fecham a conta: é só conduzir cada uma até a locação.";
  } else {
    frase += ` Você tem ${plural(e.diasLivres.length, "data livre", "datas livres")} até o fim do mês`;
    if (noMes.length > 0) frase += `, ${noMes.length === 1 ? "1 delas perto" : `${noMes.length} delas perto`} de onde você vai estar`;
    frase += ".";
    if (e.paraChamar > 0) frase += ` ${plural(e.paraChamar, "pessoa está", "pessoas estão")} na hora de chamar.`;
    if (naoCabe) frase += ` As datas livres não bastam para a meta cheia: faltam ${semReserva - e.diasLivres.length} dia(s).`;
  }

  const pessoasNasDatas = noMes.reduce((s, d) => s + d.pessoas, 0);
  let principal: PlanoMeta["principal"] = null;
  let secundaria: PlanoMeta["secundaria"] = null;
  if (semReserva > 0) {
    if (noMes.length > 0) {
      principal = { rotulo: `Ver quem encaixar (${plural(noMes.length, "data", "datas")})`, href: "/agenda/encaixe" };
      if (e.paraChamar > 0) secundaria = { rotulo: `Chamar quem está na hora (${e.paraChamar})`, href: "/relacionamento" };
    } else if (e.paraChamar > 0) {
      principal = { rotulo: `Chamar quem está na hora (${e.paraChamar})`, href: "/relacionamento" };
    }
  } else if (e.reservadas > 0) {
    principal = { rotulo: "Ver as reservas na agenda", href: "/agenda" };
  }

  return {
    faltam,
    reservadas: e.reservadas,
    semReserva,
    diasLivres: e.diasLivres.length,
    datasComGente: noMes.length,
    pessoasNasDatas,
    paraChamar: e.paraChamar,
    diasRestantes,
    porSemana,
    naoCabe,
    frase,
    principal,
    secundaria,
  };
}
