import type { SupabaseClient } from "@supabase/supabase-js";
import { CIDADES_PADRAO, normalizarCidade, type MapaCidades } from "./cidades-coordenadas";

export interface CidadeLinha {
  id: string;
  nome: string;
  nome_exibicao: string;
  uf: string | null;
  latitude: number;
  longitude: number;
}

/** Linhas da tabela cidades_coordenadas; null se a tabela não puder ser lida. */
export async function buscarCidades(supabase: SupabaseClient): Promise<CidadeLinha[] | null> {
  const { data, error } = await supabase
    .from("cidades_coordenadas")
    .select("id, nome, nome_exibicao, uf, latitude, longitude")
    .order("nome");
  if (error || !data) return null;
  return (data as CidadeLinha[]).map((c) => ({ ...c, latitude: Number(c.latitude), longitude: Number(c.longitude) }));
}

export function mapaDasCidades(linhas: CidadeLinha[]): MapaCidades {
  const mapa: MapaCidades = {};
  for (const c of linhas) {
    if (Number.isFinite(c.latitude) && Number.isFinite(c.longitude)) mapa[normalizarCidade(c.nome)] = [c.latitude, c.longitude];
  }
  return mapa;
}

/**
 * Mapa das cidades para o encaixe: o do banco, ou a lista fixa de sempre se a
 * tabela ainda não existir (SQL não rodado) ou a leitura falhar.
 */
export async function carregarMapaCidades(supabase: SupabaseClient): Promise<Readonly<MapaCidades>> {
  const linhas = await buscarCidades(supabase).catch(() => null);
  return linhas ? mapaDasCidades(linhas) : CIDADES_PADRAO;
}

/**
 * Cidades do cadastro de clientes que não têm posição no mapa (não entram no
 * encaixe), com quantas clientes cada uma tem. Grafias diferentes da mesma
 * cidade ("RECIFE", "Recife - PE") contam juntas.
 */
export function cidadesSemPosicao(
  cidadesDosClientes: (string | null | undefined)[],
  mapa: Readonly<MapaCidades>
): { nome: string; exibir: string; clientes: number }[] {
  const grupos = new Map<string, { exibir: string; clientes: number; grafias: Map<string, number> }>();
  for (const bruto of cidadesDosClientes) {
    const n = normalizarCidade(bruto);
    if (!n || Object.prototype.hasOwnProperty.call(mapa, n)) continue;
    const exibir = (bruto ?? "").replace(/\s*[-/,(].*$/, "").replace(/\s+/g, " ").trim();
    const g = grupos.get(n) ?? { exibir, clientes: 0, grafias: new Map<string, number>() };
    g.clientes += 1;
    g.grafias.set(exibir, (g.grafias.get(exibir) ?? 0) + 1);
    grupos.set(n, g);
  }
  return [...grupos.entries()]
    .map(([nome, g]) => {
      // Grafia preferida: a que não está toda em maiúsculas; empate pela mais usada.
      const grafias = [...g.grafias.entries()].sort(
        (a, b) => Number(a[0] === a[0].toUpperCase()) - Number(b[0] === b[0].toUpperCase()) || b[1] - a[1]
      );
      return { nome, exibir: grafias[0]?.[0] ?? g.exibir, clientes: g.clientes };
    })
    .sort((a, b) => b.clientes - a.clientes || a.nome.localeCompare(b.nome, "pt-BR"));
}
