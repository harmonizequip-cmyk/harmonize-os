// Arte das campanhas no navegador: reduz a imagem no próprio aparelho, sobe
// para a pasta privada "campanhas" do Storage e prepara o arquivo para o
// Compartilhar. Só código de navegador (canvas, fetch, File).

import type { SupabaseClient } from "@supabase/supabase-js";

export const PASTA_ARTE = "campanhas";
const LADO_MAXIMO = 1600;
const QUALIDADE = 0.85;

/** Lado maior até 1600 px, JPEG ~0,85, fundo branco (PNG transparente não fica preto). */
export async function reduzirArte(arquivo: Blob): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error("Não consegui abrir esta imagem. Escolha uma foto em JPG ou PNG.");
  }
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Não consegui preparar a imagem."))), "image/jpeg", QUALIDADE)
  );
}

function nomeAleatorio(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, "");
  return `${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
}

/** Sobe a arte já reduzida e devolve o caminho (arte/<id>.jpg). */
export async function enviarArte(supabase: SupabaseClient, arte: Blob): Promise<string> {
  const caminho = `arte/${nomeAleatorio()}.jpg`;
  const { error } = await supabase.storage.from(PASTA_ARTE).upload(caminho, arte, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`Não consegui subir a arte: ${error.message}`);
  return caminho;
}

/** Apaga uma arte que deixou de ser usada. Nunca lança (é só limpeza). */
export async function apagarArte(supabase: SupabaseClient, caminho: string | null | undefined): Promise<void> {
  if (!caminho) return;
  try {
    await supabase.storage.from(PASTA_ARTE).remove([caminho]);
  } catch {
    // fica um arquivo sobrando, sem efeito nas telas
  }
}

/** Endereço temporário (1 hora) para mostrar a arte privada. */
export async function urlDaArte(supabase: SupabaseClient, caminho: string | null | undefined): Promise<string | null> {
  if (!caminho) return null;
  const { data, error } = await supabase.storage.from(PASTA_ARTE).createSignedUrl(caminho, 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/** Baixa a arte como arquivo para o Compartilhar (feito ANTES do toque). */
export async function arquivoDaArte(url: string, nome: string): Promise<File> {
  const r = await fetch(url);
  if (!r.ok) throw new Error("Não consegui baixar a arte.");
  const blob = await r.blob();
  const base = (nome || "arte").replace(/\.[a-z0-9]+$/i, "").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60) || "arte";
  return new File([blob], `${base}.jpg`, { type: blob.type || "image/jpeg" });
}
