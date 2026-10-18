// O Supabase devolve no máximo 1000 linhas por consulta, mesmo com limit maior. Conta que
// precisa de tudo (saldo de sempre) busca em páginas. A consulta precisa ter uma ordem
// fixa (ex.: .order("id")) para as páginas não repetirem nem pularem linhas.
const PAGINA = 1000;

export async function buscarTodas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    // Conta pela metade é pior que erro: o saldo sairia errado calado.
    if (error) throw new Error(`Não consegui carregar os lançamentos: ${error.message}`);
    const linhas = data ?? [];
    todas.push(...linhas);
    if (linhas.length < PAGINA) return todas;
  }
}
