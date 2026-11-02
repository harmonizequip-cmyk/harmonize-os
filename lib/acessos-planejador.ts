// Tela "Acessos ao Planejador": separa as clientes em três grupos.
//  - Com acesso: login de cliente ligado e portal dentro da validade.
//  - Sem acesso: login pausado (desligado), validade vencida, ou formulário
//    preenchido esperando o dono liberar.
//  - Sem cadastro: cliente sem login e sem formulário preenchido.
// Regra pura, testada em acessos-planejador.test.ts. As ações (liberar,
// pausar, mandar formulário) usam as funções do banco que já existem.

export interface ClienteBase {
  id: string;
  nome: string;
  whatsapp: string | null;
  cidade: string | null;
  ehCliente: boolean;
  /** Para a saudação das mensagens (saudacaoCurta). */
  nomeCompleto?: string;
  tratamento?: string | null;
  nomeExibicao?: string | null;
  /** Fotos dos pacientes liberadas no portal (clients.portal_fotos); nulo sem o SQL. */
  fotos?: boolean | null;
}

export interface PerfilCliente {
  id: string;
  email: string;
  active: boolean;
  cliente_id: string;
}

export interface ConvitePreenchido {
  /** Ficha que o formulário atualizou ou criou. */
  client_id: string;
  email_login: string | null;
  preenchido_em: string;
  /** "Instagram" ou "indicação de Fulana" (resposta do formulário). */
  comoConheceu?: string | null;
}

export type MotivoSemAcesso = "pausado" | "vencido" | "preencheu";

export interface LinhaAcesso {
  cliente: ClienteBase;
  /** Login (com acesso ou pausado). */
  perfil: PerfilCliente | null;
  /** Até quando vale (AAAA-MM-DD), quando há login. */
  validoAte: string | null;
  motivo: MotivoSemAcesso | null;
  /** E-mail para liberar (do login ou do formulário). */
  email: string | null;
  /** Como conheceu a Harmonize, quando veio do formulário. */
  comoConheceu?: string | null;
}

export interface GruposAcesso {
  comAcesso: LinhaAcesso[];
  semAcesso: LinhaAcesso[];
  semCadastro: LinhaAcesso[];
}

const porNome = (a: LinhaAcesso, b: LinhaAcesso) => a.cliente.nome.localeCompare(b.cliente.nome, "pt-BR");

export function separarAcessos(
  clientes: ClienteBase[],
  perfis: PerfilCliente[],
  validades: Record<string, string | null>,
  convites: ConvitePreenchido[],
  hoje: string,
): GruposAcesso {
  const grupos: GruposAcesso = { comAcesso: [], semAcesso: [], semCadastro: [] };
  const perfilDe = new Map<string, PerfilCliente>();
  for (const p of perfis) {
    const atual = perfilDe.get(p.cliente_id);
    // Mais de um login da mesma cliente: vale o ligado.
    if (!atual || (!atual.active && p.active)) perfilDe.set(p.cliente_id, p);
  }
  const conviteDe = new Map<string, ConvitePreenchido>();
  for (const c of convites) {
    const atual = conviteDe.get(c.client_id);
    if (!atual || c.preenchido_em > atual.preenchido_em) conviteDe.set(c.client_id, c);
  }

  for (const cliente of clientes) {
    const perfil = perfilDe.get(cliente.id) ?? null;
    if (perfil) {
      const validoAte = validades[cliente.id] ?? null;
      const valido = !!validoAte && validoAte >= hoje;
      const linha: LinhaAcesso = { cliente, perfil, validoAte, motivo: null, email: perfil.email };
      if (perfil.active && valido) grupos.comAcesso.push(linha);
      else grupos.semAcesso.push({ ...linha, motivo: perfil.active ? "vencido" : "pausado" });
      continue;
    }
    const convite = conviteDe.get(cliente.id);
    if (convite?.email_login) {
      grupos.semAcesso.push({ cliente, perfil: null, validoAte: null, motivo: "preencheu", email: convite.email_login, comoConheceu: convite.comoConheceu ?? null });
      continue;
    }
    // Sem cadastro: só clientes (lead fica fora, para a lista não crescer sem fim).
    if (cliente.ehCliente) grupos.semCadastro.push({ cliente, perfil: null, validoAte: null, motivo: null, email: null });
  }
  grupos.comAcesso.sort(porNome);
  // Quem preencheu e espera vem primeiro.
  grupos.semAcesso.sort((a, b) => Number(b.motivo === "preencheu") - Number(a.motivo === "preencheu") || porNome(a, b));
  grupos.semCadastro.sort(porNome);
  return grupos;
}

export function textoMotivo(m: MotivoSemAcesso | null, validoAte: string | null): string {
  const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  if (m === "pausado") return "Pausado por você";
  if (m === "vencido") return validoAte ? `Venceu em ${br(validoAte)}` : "Sem atendimento recente";
  if (m === "preencheu") return "Preencheu o formulário, falta liberar";
  return validoAte ? `Até ${br(validoAte)}` : "";
}

/** Resposta do "Como conheceu a Harmonize?" guardada em convites_cadastro.dados. */
export function textoComoConheceu(dados: Record<string, unknown> | null | undefined): string | null {
  if (!dados) return null;
  const rotulo = typeof dados.como_conheceu_rotulo === "string" ? dados.como_conheceu_rotulo.trim() : "";
  const indicou = typeof dados.indicado_por === "string" ? dados.indicado_por.trim() : "";
  if (dados.como_conheceu === "indicacao" && indicou) return `indicação de ${indicou}`;
  return rotulo || null;
}

/** Mensagem com o link do formulário (a mesma do botão "Link de cadastro"). */
export function mensagemFormulario(link: string): string {
  return `Para liberar seu acesso ao Planejador HIPRO da Harmonize e à Contourline Academy, preencha seu cadastro neste link (você mesma cria a senha):\n\n${link}\n\nAssim que você enviar, eu libero e te aviso.`;
}
