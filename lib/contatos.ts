// Escolher um contato da agenda do celular (Contact Picker do Chrome no
// Android). Em outros navegadores a função some: podeEscolherContato() dá
// false e o botão não aparece.

interface ContatoEscolhido {
  nome: string;
  telefone: string;
}

type SeletorDeContatos = {
  select(props: string[], opts?: { multiple?: boolean }): Promise<{ name?: string[]; tel?: string[] }[]>;
};

function seletor(): SeletorDeContatos | null {
  if (typeof navigator === "undefined") return null;
  const c = (navigator as unknown as { contacts?: SeletorDeContatos }).contacts;
  return c && typeof c.select === "function" ? c : null;
}

export function podeEscolherContato(): boolean {
  return seletor() !== null;
}

/** Deixa o número como (83) 99999-8888, sem o +55. */
export function formatarTelefone(bruto: string): string {
  let d = bruto.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return bruto.trim();
}

/** Abre a agenda do celular. Volta null se a pessoa fechar sem escolher. */
export async function escolherContato(): Promise<ContatoEscolhido | null> {
  const s = seletor();
  if (!s) return null;
  const [c] = await s.select(["name", "tel"], { multiple: false });
  if (!c) return null;
  // Prefere o primeiro celular (9 dígitos depois do DDD) entre os números.
  const tels = (c.tel ?? []).map(formatarTelefone);
  const celular = tels.find((t) => /^\(\d{2}\) 9\d{4}-\d{4}$/.test(t)) ?? tels[0] ?? "";
  return { nome: (c.name?.[0] ?? "").trim(), telefone: celular };
}
