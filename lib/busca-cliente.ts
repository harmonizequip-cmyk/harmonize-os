// Busca de cliente nas listas de escolha (formulários e filtros). Muita gente
// entrou pelo WhatsApp com o telefone no lugar do nome, e em ordem alfabética
// esses cadastros ("+55 ...") vinham primeiro e escondiam os nomes.

/** Minúsculas e sem acento, para "joao" achar "JOÃO". */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Cadastro cujo nome é só um telefone. */
export function ehSoTelefone(nome: string): boolean {
  return /^[\s+\d().-]+$/.test(nome.trim());
}

const soDigitos = (t: string) => t.replace(/\D/g, "");

/** Nomes em ordem alfabética primeiro; cadastros só com telefone no fim. */
export function ordenarParaEscolha<T extends { name: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => {
    const ta = ehSoTelefone(a.name);
    const tb = ehSoTelefone(b.name);
    if (ta !== tb) return ta ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}

/**
 * Filtra pelo texto digitado: parte do nome (sem acento) ou, com 3 dígitos ou
 * mais, parte do telefone (no nome ou no WhatsApp).
 */
export function filtrarParaEscolha<T extends { name: string; whatsapp?: string | null; city?: string | null }>(
  lista: T[],
  consulta: string
): T[] {
  const termo = normalizarBusca(consulta);
  if (!termo) return ordenarParaEscolha(lista);
  const digitos = soDigitos(consulta);
  return ordenarParaEscolha(
    lista.filter((c) => {
      if (normalizarBusca(c.name).includes(termo)) return true;
      if (c.city && normalizarBusca(c.city).includes(termo)) return true;
      if (digitos.length >= 3) {
        if (soDigitos(c.name).includes(digitos)) return true;
        if (c.whatsapp && soDigitos(c.whatsapp).includes(digitos)) return true;
      }
      return false;
    })
  );
}
