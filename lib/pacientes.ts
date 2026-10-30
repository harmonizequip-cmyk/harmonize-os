// Pacientes do Planejador HIPRO: junta os planejamentos de cada paciente
// (pelo cadastro, planejamentos.paciente_id; sem ele, pela mesma cliente e
// mesmo nome) para a lista mostrar um cartão por paciente. Só contas, sem tela.

import { chavePaciente, normalizarNome, saldoParaProximaSessao } from "./historico-paciente";
import { diasAte } from "./planejamento";

/** Cadastro do paciente (tabela pacientes). */
export interface PacienteCadastro {
  id: string;
  client_id: string | null;
  nome: string;
  whatsapp: string | null;
  nascimento: string | null;
  observacoes: string | null;
  /** Quando o paciente autorizou as fotos (nulo = não autorizou; ausente antes do SQL das fotos). */
  fotos_autorizadas_em?: string | null;
}

/** O mínimo de cada planejamento que a lista precisa. */
export interface PlanoDoPaciente {
  id: string;
  client_id: string | null;
  paciente: string | null;
  paciente_id?: string | null;
  data: string | null;
  data_retorno: string | null;
  procedimento: string | null;
  saldo_total: number;
  total_disparos: number;
  updated_at: string;
  cliente_nome: string | null;
  pela_cliente?: boolean;
  sessoes_total?: number;
  sessao_atual?: number;
}

/** Planejamento que ainda tem disparos para a próxima sessão. */
export interface SaldoPendente<T> {
  plano: T;
  /** Disparos que sobram do pacote. */
  saldo: number;
  /** Sessão que vem a seguir (ex.: 2). */
  proximaSessao: number;
  sessoes: number;
}

export interface PacienteResumo<T extends PlanoDoPaciente = PlanoDoPaciente> {
  /** Chave estável: o id do cadastro, ou cliente + nome, ou o id do planejamento sem nome. */
  chave: string;
  pacienteId: string | null;
  nome: string;
  client_id: string | null;
  cliente_nome: string | null;
  /** Do mais recente para o mais antigo. */
  planos: T[];
  /** Sessões já começadas, somando todos os planejamentos. */
  sessoes: number;
  ultimaData: string | null;
  ultimoProcedimento: string | null;
  saldos: SaldoPendente<T>[];
  /** Soma dos disparos que ainda faltam usar. */
  saldoTotal: number;
  /** Retorno marcado de hoje em diante, o mais perto. */
  retorno: string | null;
  pelaCliente: boolean;
  cadastro: PacienteCadastro | null;
}

const dia = (v: string | null | undefined) => (v ?? "").slice(0, 10);

function chaveDoPlano(p: PlanoDoPaciente): string {
  if (p.paciente_id) return `id:${p.paciente_id}`;
  if (!normalizarNome(p.paciente)) return `plano:${p.id}`;
  return `nome:${chavePaciente(p.client_id, p.paciente)}`;
}

function maisRecente(a: PlanoDoPaciente, b: PlanoDoPaciente) {
  return dia(b.data).localeCompare(dia(a.data)) || b.updated_at.localeCompare(a.updated_at);
}

/**
 * Um resumo por paciente. Cadastros sem planejamento também entram (para
 * aparecerem na lista e poderem ser apagados ou ganhar um planejamento).
 * Ordem: o atendido mais recentemente primeiro.
 */
export function agruparPorPaciente<T extends PlanoDoPaciente>(planos: T[], cadastros: PacienteCadastro[] = [], hoje = ""): PacienteResumo<T>[] {
  const porId = new Map(cadastros.map((c) => [c.id, c]));
  const grupos = new Map<string, T[]>();
  for (const p of planos) {
    const k = chaveDoPlano(p);
    const g = grupos.get(k);
    if (g) g.push(p);
    else grupos.set(k, [p]);
  }
  const resumos: PacienteResumo<T>[] = [];
  for (const [chave, lista] of grupos) {
    lista.sort(maisRecente);
    const topo = lista[0];
    const cadastro = topo.paciente_id ? porId.get(topo.paciente_id) ?? null : null;
    const saldos: SaldoPendente<T>[] = lista
      .map((p) => ({ plano: p, saldo: saldoParaProximaSessao(p), proximaSessao: (p.sessao_atual ?? 1) + 1, sessoes: p.sessoes_total ?? 1 }))
      .filter((s) => s.saldo > 0);
    const retornos = lista
      .map((p) => dia(p.data_retorno))
      .filter((d) => d && (!hoje || diasAte(d, hoje) >= 0))
      .sort();
    resumos.push({
      chave,
      pacienteId: topo.paciente_id ?? null,
      nome: cadastro?.nome || topo.paciente?.trim() || "",
      client_id: topo.client_id,
      cliente_nome: topo.cliente_nome,
      planos: lista,
      sessoes: lista.reduce((t, p) => t + Math.max(1, p.sessao_atual ?? 1), 0),
      ultimaData: dia(topo.data) || null,
      ultimoProcedimento: lista.find((p) => p.procedimento?.trim())?.procedimento?.trim() || null,
      saldos,
      saldoTotal: saldos.reduce((t, s) => t + s.saldo, 0),
      retorno: retornos[0] ?? null,
      pelaCliente: lista.some((p) => p.pela_cliente),
      cadastro,
    });
  }
  const usados = new Set(resumos.map((r) => r.pacienteId).filter(Boolean));
  for (const c of cadastros) {
    if (usados.has(c.id)) continue;
    resumos.push({
      chave: `id:${c.id}`,
      pacienteId: c.id,
      nome: c.nome,
      client_id: c.client_id,
      cliente_nome: null,
      planos: [],
      sessoes: 0,
      ultimaData: null,
      ultimoProcedimento: null,
      saldos: [],
      saldoTotal: 0,
      retorno: null,
      pelaCliente: false,
      cadastro: c,
    });
  }
  return resumos.sort(
    (a, b) => (b.ultimaData ?? "").localeCompare(a.ultimaData ?? "") || a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/** Busca por nome do paciente, procedimento ou cliente (sem acento). */
export function pacienteBate<T extends PlanoDoPaciente>(r: PacienteResumo<T>, texto: string): boolean {
  const t = normalizarNome(texto);
  if (!t) return true;
  if (normalizarNome(r.nome).includes(t) || normalizarNome(r.cliente_nome).includes(t)) return true;
  return r.planos.some((p) => normalizarNome(p.procedimento).includes(t));
}

/** Sugestões para o campo "Nome do paciente": cadastros da mesma cliente que contêm o texto. */
export function sugerirPacientes(cadastros: PacienteCadastro[], texto: string, max = 6): PacienteCadastro[] {
  const t = normalizarNome(texto);
  const lista = t ? cadastros.filter((c) => normalizarNome(c.nome).includes(t)) : cadastros;
  return [...lista]
    .sort((a, b) => {
      const ai = normalizarNome(a.nome).startsWith(t) ? 0 : 1;
      const bi = normalizarNome(b.nome).startsWith(t) ? 0 : 1;
      return ai - bi || a.nome.localeCompare(b.nome, "pt-BR");
    })
    .slice(0, max);
}

/** Cadastro com o mesmo nome (sem acento e maiúscula), se houver. */
export function pacienteDeMesmoNome(cadastros: PacienteCadastro[], nome: string): PacienteCadastro | null {
  const t = normalizarNome(nome);
  if (!t) return null;
  return cadastros.find((c) => normalizarNome(c.nome) === t) ?? null;
}

/** Idade em anos completos na data de hoje (AAAA-MM-DD). */
export function idade(nascimento: string | null | undefined, hoje: string): number | null {
  const n = dia(nascimento);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(n) || !/^\d{4}-\d{2}-\d{2}$/.test(hoje)) return null;
  let anos = Number(hoje.slice(0, 4)) - Number(n.slice(0, 4));
  if (hoje.slice(5) < n.slice(5)) anos--;
  return anos >= 0 && anos < 130 ? anos : null;
}

export type Situacao = "pendente" | "concluido";

/** Planejamento com disparos para a próxima sessão = pendente; o resto, concluído. */
export function situacaoDoPlano(p: { saldo_total: number; total_disparos: number; sessoes_total?: number | null; sessao_atual?: number | null }): Situacao {
  return saldoParaProximaSessao(p) > 0 ? "pendente" : "concluido";
}

/** Paciente com algum planejamento pendente = pendente. */
export function situacaoDoPaciente(r: { saldoTotal: number }): Situacao {
  return r.saldoTotal > 0 ? "pendente" : "concluido";
}

/** Dias de HIPRO (data dos planejamentos), do mais recente para o mais antigo, sem repetir. */
export function diasDeHipro<T extends PlanoDoPaciente>(pacientes: PacienteResumo<T>[]): string[] {
  const s = new Set<string>();
  for (const r of pacientes) for (const p of r.planos) if (dia(p.data)) s.add(dia(p.data));
  return Array.from(s).sort().reverse();
}

/** Pacientes atendidos num dia de HIPRO (vazio = todos). */
export function pacientesDoDia<T extends PlanoDoPaciente>(pacientes: PacienteResumo<T>[], diaHipro: string): PacienteResumo<T>[] {
  if (!diaHipro) return pacientes;
  return pacientes.filter((r) => r.planos.some((p) => dia(p.data) === diaHipro));
}

export interface ClienteDoPlanejador<T extends PlanoDoPaciente = PlanoDoPaciente> {
  clientId: string | null;
  nome: string;
  pacientes: PacienteResumo<T>[];
  pendentes: number;
  concluidos: number;
  /** Último dia de HIPRO com planejamento. */
  ultimoDia: string | null;
}

/** Um grupo por cliente: quem tem pendente primeiro, depois o atendido mais recentemente. */
export function agruparPacientesPorCliente<T extends PlanoDoPaciente>(
  pacientes: PacienteResumo<T>[],
  nomeDaCliente: (clientId: string | null, sugestao: string | null) => string
): ClienteDoPlanejador<T>[] {
  const m = new Map<string, ClienteDoPlanejador<T>>();
  for (const r of pacientes) {
    const k = r.client_id ?? "";
    let g = m.get(k);
    if (!g) {
      g = { clientId: r.client_id, nome: nomeDaCliente(r.client_id, r.cliente_nome), pacientes: [], pendentes: 0, concluidos: 0, ultimoDia: null };
      m.set(k, g);
    }
    g.pacientes.push(r);
    if (situacaoDoPaciente(r) === "pendente") g.pendentes++;
    else g.concluidos++;
    if (r.ultimaData && (!g.ultimoDia || r.ultimaData > g.ultimoDia)) g.ultimoDia = r.ultimaData;
  }
  return Array.from(m.values()).sort(
    (a, b) =>
      (a.clientId ? 0 : 1) - (b.clientId ? 0 : 1) ||
      (b.pendentes > 0 ? 1 : 0) - (a.pendentes > 0 ? 1 : 0) ||
      (b.ultimoDia ?? "").localeCompare(a.ultimoDia ?? "") ||
      a.nome.localeCompare(b.nome, "pt-BR")
  );
}
