// Para onde cada login vai ao entrar (segurança, 05/11/2026). Regra pura,
// testada em acesso.test.ts. Na dúvida, NÃO entra na Harmonize: login sem
// perfil (criado pelo formulário ou pelo cadastro aberto do Auth), perfil
// desligado, sem nenhuma permissão ou com erro ao ler o perfil vai para
// /sem-acesso. Login de cliente vai para o portal (que confere a validade).

export interface PerfilAcesso {
  is_admin?: boolean | null;
  active?: boolean | null;
  somente_leitura?: boolean | null;
  cliente_id?: string | null;
  permissions?: Record<string, unknown> | null;
}

export type Destino = "harmonize" | "portal" | "sem_acesso";

export function destinoDoLogin(perfil: PerfilAcesso | null | undefined, erroAoLer = false): Destino {
  if (erroAoLer || !perfil) return "sem_acesso";
  if (perfil.cliente_id) return "portal";
  if (perfil.active !== true) return "sem_acesso";
  if (perfil.is_admin === true) return "harmonize";
  const p = perfil.permissions && typeof perfil.permissions === "object" ? perfil.permissions : {};
  const algumaPermissao = Object.values(p).some((v) => v === true);
  return algumaPermissao ? "harmonize" : "sem_acesso";
}

/** Mensagem para a Harmonize pedindo acesso (portal pausado ou cadastro esperando). */
export function mensagemPedirAcesso(tipo: "pausado" | "aguardando" | "desligado", nome: string | null, email: string | null): string {
  const quem = nome?.trim() ? `Sou ${nome.trim()}` : "Tudo bem";
  const com = email ? ` (login ${email})` : "";
  if (tipo === "pausado") return `Olá! ${quem}${com}. Meu acesso ao Planejador HIPRO está pausado e gostaria de pedir a liberação de um novo acesso.`;
  if (tipo === "desligado") return `Olá! ${quem}${com}. Meu acesso ao Planejador HIPRO está desligado e gostaria de pedir um novo acesso.`;
  return `Olá! ${quem}${com}. Fiz meu cadastro e gostaria de pedir a liberação do meu acesso ao Planejador HIPRO.`;
}
