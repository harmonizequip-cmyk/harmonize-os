import type { SupabaseClient } from "@supabase/supabase-js";
import { reduzirFoto } from "./foto";

// Comprovantes de pagamento, na pasta privada "comprovantes" do Storage:
//   locacao/<id da locação>/<data e hora>.jpg|pdf
//   taxa/<id da reserva>/<data e hora>.jpg|pdf
export const PASTA_COMPROVANTES = "comprovantes";

// Mesmo nome usado no public/sw.js, que guarda aqui o arquivo que chega
// pelo "Compartilhar > Harmonize".
const CAIXA_COMPARTILHADO = "harmonize-compartilhado";
const CHAVE_COMPARTILHADO = "/compartilhado/atual";

export async function lerCompartilhado(): Promise<File | null> {
  if (typeof caches === "undefined") return null;
  try {
    const caixa = await caches.open(CAIXA_COMPARTILHADO);
    const resposta = await caixa.match(CHAVE_COMPARTILHADO);
    if (!resposta) return null;
    const blob = await resposta.blob();
    const nome = decodeURIComponent(resposta.headers.get("X-Nome") ?? "comprovante");
    return new File([blob], nome, { type: blob.type || resposta.headers.get("Content-Type") || "" });
  } catch {
    return null;
  }
}

export async function limparCompartilhado(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const caixa = await caches.open(CAIXA_COMPARTILHADO);
    await caixa.delete(CHAVE_COMPARTILHADO);
  } catch {
    // nada a fazer
  }
}

export function ehPdf(arquivo: Blob): boolean {
  return arquivo.type === "application/pdf";
}

/** Sobe o comprovante para a pasta indicada (ex.: "locacao/<id>"). */
export async function enviarComprovante(
  supabase: SupabaseClient,
  pasta: string,
  arquivo: Blob
): Promise<{ ok: boolean }> {
  const pdf = ehPdf(arquivo);
  const corpo = pdf ? arquivo : await reduzirFoto(arquivo);
  const carimbo = new Date().toISOString().replace(/[:.]/g, "-");
  const { error } = await supabase.storage
    .from(PASTA_COMPROVANTES)
    .upload(`${pasta}/${carimbo}.${pdf ? "pdf" : "jpg"}`, corpo, {
      contentType: pdf ? "application/pdf" : "image/jpeg",
    });
  return { ok: !error };
}
