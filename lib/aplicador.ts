// Garantia do aplicador do HIPRO (o fabricante garante até um número de
// disparos): quanto já foi usado. Passar da garantia não para o aplicador,
// só tira a cobertura.

export interface AplicadorUso {
  id: string;
  nome: string;
  numero_serie: string | null;
  garantia_disparos: number | null;
  contador_base: number;
  contador_base_em: string;
  ativo: boolean;
  equipment_id: string | null;
  montado_desde: string | null;
  disparos: number;
}

/** A partir de quanto da garantia o aplicador entra em alerta. */
export const ALERTA_APLICADOR = 0.9;

/** Garantia padrão do fabricante, sugerida no cadastro. */
export const GARANTIA_PADRAO = 6_000_000;

export type SituacaoAplicador = "sem_garantia" | "ok" | "perto" | "fora";

export function situacaoAplicador(a: Pick<AplicadorUso, "disparos" | "garantia_disparos">): {
  situacao: SituacaoAplicador;
  pct: number | null;
  faltam: number | null;
} {
  if (!a.garantia_disparos) return { situacao: "sem_garantia", pct: null, faltam: null };
  const pct = a.disparos / a.garantia_disparos;
  const faltam = Math.max(0, a.garantia_disparos - a.disparos);
  return { situacao: pct >= 1 ? "fora" : pct >= ALERTA_APLICADOR ? "perto" : "ok", pct, faltam };
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
