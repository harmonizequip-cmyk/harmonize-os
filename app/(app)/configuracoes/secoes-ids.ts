// Assuntos de Configurações (?secao=<id>). Fica fora do componente do
// navegador porque a página (servidor) também precisa conferir o id.
export const TITULOS_SECAO = {
  precos: "Preços",
  metas: "Metas do mês",
  contas: "Contas fixas",
  tags: "Tags",
  automacoes: "Automações",
  empresa: "Dados da empresa",
  contrato: "Contrato",
  tabelaPrecos: "Tabela de preços",
  categorias: "Categorias",
  contasPix: "Contas PIX",
  cidades: "Cidades do encaixe",
  relacionamento: "Relacionamento",
  agenda: "Agenda e encaixe",
  listas: "Listas",
  dashboard: "Dashboard",
  planejador: "Planejador",
  avisos: "Avisos no celular",
  digital: "Entrar com a digital",
  aparencia: "Aparência",
  backup: "Backup",
  acesso: "Acesso só de visualização",
  conta: "Minha conta",
} as const;

export type SecaoId = keyof typeof TITULOS_SECAO;

export function ehSecao(v: string | undefined): v is SecaoId {
  return !!v && Object.prototype.hasOwnProperty.call(TITULOS_SECAO, v);
}
