// Fotos dos pacientes no navegador: reduz no próprio aparelho (canvas), sobe
// para a pasta privada "fotos-pacientes" do Storage, registra no banco e gera
// endereços temporários reaproveitados. Só código de navegador.

import type { SupabaseClient } from "@supabase/supabase-js";
import { PASTA_FOTOS, caminhosDaFoto, medidasReduzidas, type EtapaFoto } from "./fotos-paciente";

const FOTO_LADO = 1600;
const FOTO_QUALIDADE = 0.85;
const MINI_LADO = 400;
const MINI_QUALIDADE = 0.8;
/** Validade dos endereços assinados: 24 horas. */
const VALIDADE_S = 24 * 60 * 60;
/** Troca o endereço quando falta menos de 1 hora para vencer. */
const FOLGA_MS = 60 * 60 * 1000;

interface Reduzida {
  blob: Blob;
  largura: number;
  altura: number;
}

function desenhar(bitmap: ImageBitmap, ladoMaximo: number, qualidade: number): Promise<Reduzida> {
  const { largura, altura } = medidasReduzidas(bitmap.width, bitmap.height, ladoMaximo);
  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, largura, altura);
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve({ blob: b, largura, altura }) : reject(new Error("Não consegui preparar a foto."))),
      "image/jpeg",
      qualidade
    )
  );
}

/** Foto (lado maior 1600 px, JPEG 0,85) e miniatura (400 px, JPEG 0,8), fundo branco. */
export async function reduzirFoto(arquivo: Blob): Promise<{ foto: Reduzida; mini: Reduzida }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo);
  } catch {
    throw new Error("Não consegui abrir esta foto. Escolha uma foto em JPG ou PNG.");
  }
  try {
    const foto = await desenhar(bitmap, FOTO_LADO, FOTO_QUALIDADE);
    const mini = await desenhar(bitmap, MINI_LADO, MINI_QUALIDADE);
    return { foto, mini };
  } finally {
    bitmap.close();
  }
}

function idAleatorio(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

export interface NovaFoto {
  pacienteId: string;
  etapa: EtapaFoto;
  /** null = Geral. */
  area: string | null;
  planejamentoId: string | null;
  /** AAAA-MM-DD. */
  tiradaEm: string;
  arquivo: Blob;
  observacao?: string | null;
}

/** Reduz, sobe foto e miniatura e registra. Se o registro falhar, apaga o que subiu. Devolve o id. */
export async function enviarFotoPaciente(supabase: SupabaseClient, nova: NovaFoto): Promise<string> {
  const { foto, mini } = await reduzirFoto(nova.arquivo);
  const { caminho, miniatura } = caminhosDaFoto(nova.pacienteId, nova.etapa, idAleatorio());
  const pasta = supabase.storage.from(PASTA_FOTOS);
  const subidos: string[] = [];
  const limpar = async () => {
    if (!subidos.length) return;
    try {
      await pasta.remove(subidos);
    } catch {
      // fica um arquivo sobrando, sem efeito nas telas
    }
  };

  const up1 = await pasta.upload(caminho, foto.blob, { contentType: "image/jpeg", upsert: false });
  if (up1.error) throw new Error(`Não consegui subir a foto: ${up1.error.message}`);
  subidos.push(caminho);
  const up2 = await pasta.upload(miniatura, mini.blob, { contentType: "image/jpeg", upsert: false });
  if (up2.error) {
    await limpar();
    throw new Error(`Não consegui subir a miniatura: ${up2.error.message}`);
  }
  subidos.push(miniatura);

  const { data, error } = await supabase.rpc("registrar_foto_paciente", {
    p_paciente_id: nova.pacienteId,
    p_etapa: nova.etapa,
    p_area: nova.area,
    p_caminho: caminho,
    p_miniatura: miniatura,
    p_largura: foto.largura,
    p_altura: foto.altura,
    p_tamanho_bytes: foto.blob.size + mini.blob.size,
    p_tirada_em: nova.tiradaEm,
    p_planejamento_id: nova.planejamentoId,
    p_observacao: nova.observacao ?? null,
  });
  if (error) {
    await limpar();
    throw new Error(error.message || "Não consegui registrar a foto.");
  }
  return String(data ?? "");
}

/** Apaga o registro e depois os dois arquivos do Storage. */
export async function apagarFotoPaciente(supabase: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await supabase.rpc("excluir_foto_paciente", { p_id: id });
  if (error) throw new Error(error.message || "Não consegui apagar a foto.");
  const r = (Array.isArray(data) ? data[0] : data) as { caminho?: string | null; miniatura?: string | null } | null;
  const arquivos = [r?.caminho, r?.miniatura].filter((c): c is string => !!c);
  for (const c of arquivos) cache.delete(c);
  if (!arquivos.length) return;
  try {
    await supabase.storage.from(PASTA_FOTOS).remove(arquivos);
  } catch {
    // o registro já saiu; o arquivo sobrando não aparece em tela nenhuma
  }
}

const cache = new Map<string, { url: string; vence: number }>();

/**
 * Endereços temporários (24 horas) num pedido só, guardados por caminho até
 * perto de vencer: o mesmo arquivo usa sempre o mesmo endereço (o navegador
 * aproveita o que já baixou).
 */
export async function urlsAssinadas(supabase: SupabaseClient, caminhos: string[]): Promise<Map<string, string>> {
  const agora = Date.now();
  const saida = new Map<string, string>();
  const faltam: string[] = [];
  for (const c of new Set(caminhos.filter(Boolean))) {
    const g = cache.get(c);
    if (g && g.vence - FOLGA_MS > agora) saida.set(c, g.url);
    else faltam.push(c);
  }
  if (faltam.length) {
    const { data, error } = await supabase.storage.from(PASTA_FOTOS).createSignedUrls(faltam, VALIDADE_S);
    if (error) throw new Error(error.message || "Não consegui abrir as fotos.");
    const vence = agora + VALIDADE_S * 1000;
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl || item.error) continue;
      cache.set(item.path, { url: item.signedUrl, vence });
      saida.set(item.path, item.signedUrl);
    }
  }
  return saida;
}
