// Reduz uma foto no próprio aparelho antes de subir: lado maior de 1600 px,
// JPEG. Uma foto de 4 MB do celular vira algo perto de 200 KB, o que cabe
// muitas no plano gratuito do Supabase e sobe rápido no 4G.
const LADO_MAXIMO = 1600;

export async function reduzirFoto(arquivo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("foto"))), "image/jpeg", 0.75)
  );
}
