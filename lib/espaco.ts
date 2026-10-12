// Dois espaços no app: Harmonize (o negócio) e Pessoal (o dinheiro do dono).
// O espaço sai do endereço: tudo em /pessoal é o Pessoal.

export function ehEspacoPessoal(pathname: string | null | undefined): boolean {
  return !!pathname && (pathname === "/pessoal" || pathname.startsWith("/pessoal/"));
}
