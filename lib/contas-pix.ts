// Contas PIX que recebem pagamentos (tabela contas_pix, 24/10/2026). O código
// de cada conta é o que fica gravado em rental_payments.pix_conta. As três de
// sempre ficam aqui como reserva: se a tabela não puder ser lida (SQL ainda não
// rodado, sem rede), as telas e o texto do WhatsApp usam estas.

import type { SupabaseClient } from "@supabase/supabase-js";

export type TipoChavePix = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

export interface ContaPix {
  id?: string;
  codigo: string;
  rotulo: string;
  titular: string;
  tipo_chave: TipoChavePix;
  chave: string;
  ordem: number;
  ativa: boolean;
  padrao: boolean;
}

export const CONTAS_PIX_PADRAO: ContaPix[] = [
  { codigo: "eder", rotulo: "Eder", titular: "Eder Campos de Almeida", tipo_chave: "cpf", chave: "07442790623", ordem: 1, ativa: true, padrao: false },
  { codigo: "harmonize", rotulo: "Harmonize", titular: "Harmonize Bella Prime LTDA", tipo_chave: "email", chave: "harmonizequip@gmail.com", ordem: 2, ativa: true, padrao: true },
  {
    codigo: "laser_dream",
    rotulo: "Laser Dream",
    titular: "Laser Dream Campina Grande LTDA",
    tipo_chave: "aleatoria",
    chave: "ed21011f-1880-4293-9cb3-cdc087ac80de",
    ordem: 3,
    ativa: true,
    padrao: false,
  },
];

export const TIPOS_CHAVE_PIX: { value: TipoChavePix; label: string }[] = [
  { value: "cpf", label: "CPF" },
  { value: "cnpj", label: "CNPJ" },
  { value: "email", label: "E-mail" },
  { value: "telefone", label: "Telefone" },
  { value: "aleatoria", label: "Chave aleatória" },
];

export function ordenarContasPix(lista: ContaPix[]): ContaPix[] {
  return [...lista].sort((a, b) => a.ordem - b.ordem || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Contas para escolher: só as ativas, mais a que já está no pagamento (`manter`). */
export function contasParaEscolha(lista: ContaPix[] | null | undefined, manter?: string | null): ContaPix[] {
  const base = lista && lista.length > 0 ? lista : CONTAS_PIX_PADRAO;
  return ordenarContasPix(base.filter((c) => c.ativa || (manter && c.codigo === manter)));
}

/** Código da conta que vem marcada: a padrão ativa, senão a primeira ativa, senão "harmonize". */
export function codigoPadrao(lista: ContaPix[] | null | undefined): string {
  const ativas = contasParaEscolha(lista);
  return ativas.find((c) => c.padrao)?.codigo ?? ativas[0]?.codigo ?? "harmonize";
}

export function contaPorCodigo(lista: ContaPix[] | null | undefined, codigo: string | null | undefined): ContaPix | null {
  if (!codigo) return null;
  const base = lista && lista.length > 0 ? lista : CONTAS_PIX_PADRAO;
  return base.find((c) => c.codigo === codigo) ?? CONTAS_PIX_PADRAO.find((c) => c.codigo === codigo) ?? null;
}

/** Chave para mostrar: CPF 074.427.906-23, CNPJ 12.345.678/0001-90; o resto como está. */
export function chaveFormatada(c: Pick<ContaPix, "tipo_chave" | "chave">): string {
  const d = c.chave.replace(/\D/g, "");
  if (c.tipo_chave === "cpf" && d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (c.tipo_chave === "cnpj" && d.length === 14) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return c.chave;
}

/** Mesma conferência de salvar_conta_pix, para avisar antes de gravar. */
export function problemaContaPix(c: { rotulo: string; titular: string; tipo_chave: string; chave: string; ativa: boolean; padrao: boolean }): string | null {
  if (!c.rotulo.trim() || c.rotulo.trim().length > 40) return "Escreva um nome curto para a conta (até 40 caracteres).";
  if (!c.titular.trim()) return "Escreva o nome do titular (favorecido).";
  const chave = c.chave.trim();
  if (!chave) return "Escreva a chave PIX.";
  const d = chave.replace(/\D/g, "");
  if (c.tipo_chave === "cpf" && d.length !== 11) return "CPF precisa ter 11 números.";
  if (c.tipo_chave === "cnpj" && d.length !== 14) return "CNPJ precisa ter 14 números.";
  if (c.tipo_chave === "telefone" && d.length < 10) return "Telefone incompleto.";
  if (c.tipo_chave === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(chave)) return "E-mail inválido.";
  if (c.padrao && !c.ativa) return "A conta padrão precisa estar ativa.";
  return null;
}

/** Lê as contas; null se a tabela não puder ser lida (as telas usam as de sempre). */
export async function buscarContasPix(supabase: SupabaseClient): Promise<ContaPix[] | null> {
  const { data, error } = await supabase
    .from("contas_pix")
    .select("id, codigo, rotulo, titular, tipo_chave, chave, ordem, ativa, padrao")
    .order("ordem");
  if (error || !data || data.length === 0) return null;
  return ordenarContasPix(data as ContaPix[]);
}
