// Profissionais da clínica (tabela profissionais): cada cliente cadastra quem
// atende os pacientes do Planejador HIPRO. Aqui só as regras puras (testadas
// em profissionais.test.ts); a leitura e a gravação ficam nas telas.

import { normalizarNome } from "./historico-paciente";

export interface Profissional {
  id: string;
  client_id: string;
  nome: string;
  registro: string | null;
  ativo: boolean;
}

/** Profissionais de uma clínica: ativas primeiro, depois por nome. */
export function profissionaisDaCliente(lista: Profissional[], clientId: string | null | undefined): Profissional[] {
  if (!clientId) return [];
  return lista
    .filter((p) => p.client_id === clientId)
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"));
}

export const ativas = (lista: Profissional[]) => lista.filter((p) => p.ativo);

/**
 * Cadastro que corresponde ao que está no planejamento: pelo id guardado ou,
 * em planejamento antigo (só o nome escrito), pelo nome sem acento nem maiúscula.
 */
export function profissionalDoPlano(
  lista: Profissional[],
  plano: { profissionalId?: string | null; profissional?: string | null }
): Profissional | null {
  if (plano.profissionalId) {
    const porId = lista.find((p) => p.id === plano.profissionalId);
    if (porId) return porId;
  }
  const nome = normalizarNome(plano.profissional);
  if (!nome) return null;
  return lista.find((p) => normalizarNome(p.nome) === nome) ?? null;
}

/**
 * Escolha automática no planejamento: com uma profissional ativa só, ela já
 * vem escolhida, desde que o campo esteja vazio ou ainda com o nome padrão da
 * cliente (nunca troca algo que alguém escolheu ou escreveu).
 */
export function escolhaAutomatica(
  lista: Profissional[],
  plano: { profissionalId?: string | null; profissional?: string | null },
  nomePadrao?: string | null
): Profissional | null {
  if (plano.profissionalId) return null;
  const at = ativas(lista);
  if (at.length !== 1) return null;
  const atual = normalizarNome(plano.profissional);
  if (atual && atual !== normalizarNome(nomePadrao) && atual !== normalizarNome(at[0].nome)) return null;
  return at[0];
}

/** "Dra. Ana · CRBM 1234" (só o nome sem registro). */
export function rotuloProfissional(p: { nome: string; registro?: string | null }): string {
  const r = (p.registro ?? "").trim();
  return r ? `${p.nome} · ${r}` : p.nome;
}

/** Erro do formulário (nome e registro) ou null. */
export function problemaProfissional(f: { nome: string; registro?: string | null }): string | null {
  const nome = f.nome.replace(/\s+/g, " ").trim();
  if (!nome) return "Escreva o nome da profissional.";
  if (nome.length > 120) return "Nome grande demais.";
  if ((f.registro ?? "").trim().length > 60) return "Registro grande demais.";
  return null;
}

/** Já existe outra com o mesmo nome (sem acento nem maiúscula) na lista? */
export function nomeRepetido(lista: Profissional[], nome: string, ignorarId?: string | null): Profissional | null {
  const n = normalizarNome(nome);
  return lista.find((p) => p.id !== ignorarId && normalizarNome(p.nome) === n) ?? null;
}

/** Erro de banco que quer dizer "falta rodar o SQL" (tabela ou função não existe). */
export function faltaSql(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST205" ||
    /does not exist|could not find the (table|function)/i.test(error.message ?? "")
  );
}
