// Cidades da cliente (10/11/2026): a principal (clients.city) e as extras
// (clients.cidades_extras), mais a ajuda para completar a cidade de quem está
// sem (estado pelo DDD do WhatsApp). Regras puras, testadas em cidades-cliente.test.ts.

import { normalizarCidade } from "./cidades-coordenadas";

/** Cidade principal primeiro, depois as extras, sem repetir e sem vazias. */
export function cidadesDaCliente(principal: string | null | undefined, extras?: readonly (string | null | undefined)[] | null): string[] {
  const vistas = new Set<string>();
  const lista: string[] = [];
  for (const c of [principal, ...(extras ?? [])]) {
    const t = (c ?? "").trim();
    const k = normalizarCidade(t);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    lista.push(t);
  }
  return lista;
}

/** Junta uma cidade nova às extras (em maiúsculas, sem repetir a principal nem as outras). */
export function adicionarCidadeExtra(principal: string | null | undefined, extras: readonly string[], nova: string): string[] {
  const t = nova.trim().replace(/\s+/g, " ").toUpperCase();
  if (!normalizarCidade(t)) return [...extras];
  const ja = cidadesDaCliente(principal, extras).map(normalizarCidade);
  return ja.includes(normalizarCidade(t)) ? [...extras] : [...extras, t];
}

// DDD → UF (todos os DDDs do Brasil).
const UF_POR_DDD: Record<string, string> = {};
const FAIXAS: [string, number[]][] = [
  ["SP", [11, 12, 13, 14, 15, 16, 17, 18, 19]], ["RJ", [21, 22, 24]], ["ES", [27, 28]],
  ["MG", [31, 32, 33, 34, 35, 37, 38]], ["PR", [41, 42, 43, 44, 45, 46]], ["SC", [47, 48, 49]],
  ["RS", [51, 53, 54, 55]], ["DF", [61]], ["GO", [62, 64]], ["TO", [63]], ["MT", [65, 66]],
  ["MS", [67]], ["AC", [68]], ["RO", [69]], ["BA", [71, 73, 74, 75, 77]], ["SE", [79]],
  ["PE", [81, 87]], ["AL", [82]], ["PB", [83]], ["RN", [84]], ["CE", [85, 88]], ["PI", [86, 89]],
  ["PA", [91, 93, 94]], ["AM", [92, 97]], ["RR", [95]], ["AP", [96]], ["MA", [98, 99]],
];
for (const [uf, ddds] of FAIXAS) for (const d of ddds) UF_POR_DDD[String(d)] = uf;

/** Estado provável pelo DDD do WhatsApp ("5583999..." ou "(83) 9..." → "PB"). */
export function ufPeloWhatsapp(whatsapp: string | null | undefined): string | null {
  let d = (whatsapp ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length < 10) return null;
  return UF_POR_DDD[d.slice(0, 2)] ?? null;
}

export const UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"];

export interface CidadeConhecida {
  nome: string;
  uf: string | null;
}

/** Sugestões para o campo de cidade: as que começam com o texto primeiro, do estado provável na frente. */
export function sugerirCidades(texto: string, conhecidas: readonly CidadeConhecida[], ufProvavel?: string | null, max = 6): CidadeConhecida[] {
  const alvo = normalizarCidade(texto);
  if (!alvo) return [];
  const vistas = new Set<string>();
  const achadas = conhecidas.filter((c) => {
    const k = normalizarCidade(c.nome);
    if (!k.includes(alvo) || vistas.has(k + (c.uf ?? ""))) return false;
    vistas.add(k + (c.uf ?? ""));
    return true;
  });
  const peso = (c: CidadeConhecida) => (normalizarCidade(c.nome).startsWith(alvo) ? 0 : 2) + (ufProvavel && c.uf === ufProvavel ? 0 : 1);
  return achadas.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome, "pt-BR")).slice(0, max);
}
