// Revisão anual do HIPRO: próxima = última + 1 ano. Avisa 30 dias antes.

import { duracaoEmDias } from "./period";

export const AVISO_REVISAO_DIAS = 30;

/** Mesma data no ano seguinte (29/02 vira 28/02). */
export function proximaRevisao(ultima: string): string {
  const [a, m, d] = ultima.split("-").map(Number);
  const dia = m === 2 && d === 29 ? 28 : d;
  return `${a + 1}-${String(m).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export type SituacaoRevisao = "sem_data" | "ok" | "perto" | "vencida";

export function situacaoRevisao(
  ultima: string | null | undefined,
  hoje: string
): { situacao: SituacaoRevisao; proxima: string | null; dias: number | null } {
  if (!ultima) return { situacao: "sem_data", proxima: null, dias: null };
  const proxima = proximaRevisao(ultima);
  // dias até a próxima (negativo = vencida há tantos dias)
  const dias = proxima >= hoje ? duracaoEmDias(hoje, proxima) - 1 : -(duracaoEmDias(proxima, hoje) - 1);
  const situacao = dias < 0 ? "vencida" : dias <= AVISO_REVISAO_DIAS ? "perto" : "ok";
  return { situacao, proxima, dias };
}
