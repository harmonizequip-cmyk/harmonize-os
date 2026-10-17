// Assuntos de Configurações (?secao=<id>). Fica fora do componente do
// navegador porque a página (servidor) também precisa conferir o id.
export const TITULOS_SECAO = {
  precos: "Preços",
  contas: "Contas fixas",
  tags: "Tags",
  automacoes: "Automações",
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
