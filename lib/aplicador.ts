// Desgaste do aplicador do HIPRO: quanto do limite de disparos já foi usado.

export interface AplicadorUso {
  id: string;
  nome: string;
  numero_serie: string | null;
  limite_disparos: number | null;
  contador_base: number;
  contador_base_em: string;
  ativo: boolean;
  equipment_id: string | null;
  montado_desde: string | null;
  disparos: number;
}

/** A partir de quanto do limite o aplicador entra em alerta. */
export const ALERTA_APLICADOR = 0.9;

export type SituacaoAplicador = "sem_limite" | "ok" | "perto" | "passou";

export function situacaoAplicador(a: Pick<AplicadorUso, "disparos" | "limite_disparos">): {
  situacao: SituacaoAplicador;
  pct: number | null;
  faltam: number | null;
} {
  if (!a.limite_disparos) return { situacao: "sem_limite", pct: null, faltam: null };
  const pct = a.disparos / a.limite_disparos;
  const faltam = Math.max(0, a.limite_disparos - a.disparos);
  return { situacao: pct >= 1 ? "passou" : pct >= ALERTA_APLICADOR ? "perto" : "ok", pct, faltam };
}

/** "120000" ou "120.000" para número inteiro; null se vazio. */
export function lerContador(texto: string): number | null {
  const d = texto.replace(/\D/g, "");
  return d ? Number(d) : null;
}

/** 120000 vira "120.000" enquanto digita. */
export function formatarContador(texto: string): string {
  const n = lerContador(texto);
  return n == null ? "" : n.toLocaleString("pt-BR");
}
