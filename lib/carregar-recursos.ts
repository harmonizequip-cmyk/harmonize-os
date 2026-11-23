import type { SupabaseClient } from "@supabase/supabase-js";
import { lerLiberados } from "./recursos";

/**
 * Ids dos recursos que o dono já liberou para as clientes (função recursos_liberados).
 * Erro ou SQL ainda não rodado: lista vazia, então tudo continua em teste.
 */
export async function carregarRecursosLiberados(supabase: SupabaseClient): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc("recursos_liberados");
    if (error) return [];
    return lerLiberados(data);
  } catch {
    return [];
  }
}
