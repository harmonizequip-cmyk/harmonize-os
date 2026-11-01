// Assinaturas da sessão no navegador: carregar, enviar a imagem para a pasta
// privada "assinaturas", registrar no banco, apagar e baixar a imagem para a
// impressão. Só o dono (pode_assinar_sessao); as regras puras ficam em
// lib/assinatura-sessao.ts.
"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { faltaSql } from "@/lib/profissionais";
import { caminhoAssinatura, type AssinaturaSessao, type PapelAssinatura, type ResumoSessao } from "@/lib/assinatura-sessao";
import type { AssinaturaImpressa } from "@/lib/planejador-impressao";

export const PASTA_ASSINATURAS = "assinaturas";
export const MSG_FALTA_SQL_ASSINATURAS = "Falta rodar o SQL das assinaturas.";

export type EstadoAssinaturas = "carregando" | "sem_sql" | "sem_permissao" | "erro" | "ok";

const COLUNAS = "id, planejamento_id, sessao, papel, nome, profissional_id, registro, imagem, conteudo_hash, resumo, assinada_em";

/** Assinaturas dos planejamentos (só para o dono; para os outros, "sem_permissao"). */
export function useAssinaturasSessao(planoIds: string[], ativo: boolean) {
  const chave = planoIds.filter(Boolean).sort().join(",");
  const [estado, setEstado] = useState<EstadoAssinaturas>("carregando");
  const [lista, setLista] = useState<AssinaturaSessao[]>([]);
  const [volta, setVolta] = useState(0);

  useEffect(() => {
    if (!ativo) {
      setEstado("sem_permissao");
      return;
    }
    let vivo = true;
    const sb = createClient();
    (async () => {
      const pode = await sb.rpc("pode_assinar_sessao");
      if (!vivo) return;
      if (pode.error) return setEstado(faltaSql(pode.error) ? "sem_sql" : "erro");
      if (!pode.data) return setEstado("sem_permissao");
      const ids = chave ? chave.split(",") : [];
      if (!ids.length) {
        setLista([]);
        return setEstado("ok");
      }
      const { data, error } = await sb.from("assinaturas_sessao").select(COLUNAS).in("planejamento_id", ids).order("assinada_em");
      if (!vivo) return;
      if (error) return setEstado(faltaSql(error) ? "sem_sql" : "erro");
      setLista((data ?? []) as AssinaturaSessao[]);
      setEstado("ok");
    })().catch(() => vivo && setEstado("erro"));
    return () => {
      vivo = false;
    };
  }, [chave, ativo, volta]);

  const recarregar = useCallback(() => setVolta((v) => v + 1), []);
  return { estado, lista, recarregar };
}

function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

export interface DadosAssinatura {
  planoId: string;
  sessao: number;
  papel: PapelAssinatura;
  nome: string;
  profissionalId?: string | null;
  registro?: string | null;
  imagem: Blob;
  hash: string;
  resumo: ResumoSessao;
}

/** Sobe a imagem e registra; se o banco recusar, apaga o arquivo. Apaga também o arquivo da assinatura substituída. */
export async function enviarAssinatura(sb: SupabaseClient, d: DadosAssinatura): Promise<void> {
  const caminho = caminhoAssinatura(d.planoId, d.sessao, d.papel, novoId());
  const up = await sb.storage.from(PASTA_ASSINATURAS).upload(caminho, d.imagem, { contentType: "image/png", upsert: false });
  if (up.error) {
    if (/bucket not found/i.test(up.error.message)) throw new Error(MSG_FALTA_SQL_ASSINATURAS);
    throw new Error("Não consegui enviar a assinatura. Confira a internet e tente de novo.");
  }
  const { data, error } = await sb.rpc("registrar_assinatura_sessao", {
    p_planejamento_id: d.planoId,
    p_sessao: d.sessao,
    p_papel: d.papel,
    p_nome: d.nome,
    p_profissional_id: d.profissionalId ?? null,
    p_registro: d.registro ?? null,
    p_imagem: caminho,
    p_conteudo_hash: d.hash,
    p_resumo: d.resumo,
    p_aparelho: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) {
    await sb.storage.from(PASTA_ASSINATURAS).remove([caminho]);
    throw new Error(faltaSql(error) ? MSG_FALTA_SQL_ASSINATURAS : error.message || "Não consegui registrar a assinatura.");
  }
  const anterior = (data as { anterior?: string | null } | null)?.anterior;
  if (anterior) await sb.storage.from(PASTA_ASSINATURAS).remove([anterior]);
}

/** Apaga a assinatura e o arquivo dela. */
export async function apagarAssinatura(sb: SupabaseClient, id: string): Promise<void> {
  const { data, error } = await sb.rpc("excluir_assinatura_sessao", { p_id: id });
  if (error) throw new Error(error.message || "Não consegui apagar a assinatura.");
  const caminho = (data as { caminho?: string } | null)?.caminho;
  if (caminho) await sb.storage.from(PASTA_ASSINATURAS).remove([caminho]);
}

/**
 * Antes de apagar planejamentos: guarda os caminhos das imagens das
 * assinaturas deles (o banco apaga as linhas junto). Depois de apagar,
 * chame a função devolvida para remover os arquivos.
 */
export async function prepararLimpezaAssinaturas(sb: SupabaseClient, planoIds: string[]): Promise<() => Promise<void>> {
  if (!planoIds.length) return async () => {};
  const { data, error } = await sb.from("assinaturas_sessao").select("imagem").in("planejamento_id", planoIds);
  const caminhos = error ? [] : (data ?? []).map((r: { imagem: string }) => r.imagem).filter(Boolean);
  return async () => {
    if (caminhos.length) await sb.storage.from(PASTA_ASSINATURAS).remove(caminhos);
  };
}

function blobParaDataUrl(b: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsDataURL(b);
  });
}

/** Assinaturas prontas para a impressão (imagens baixadas como data URL). */
export async function paraImpressao(sb: SupabaseClient, lista: AssinaturaSessao[]): Promise<AssinaturaImpressa[]> {
  return Promise.all(
    lista.map(async (a) => {
      let src = "";
      try {
        const { data } = await sb.storage.from(PASTA_ASSINATURAS).download(a.imagem);
        if (data) src = await blobParaDataUrl(data);
      } catch {
        // sem a imagem, sai o nome, o registro e a data
      }
      return { papel: a.papel, nome: a.nome, registro: a.registro, assinadaEm: a.assinada_em, src, hash: a.conteudo_hash };
    })
  );
}

/** URL assinada (10 min) para mostrar a imagem na tela. */
export async function urlDaAssinatura(sb: SupabaseClient, caminho: string): Promise<string | null> {
  const { data } = await sb.storage.from(PASTA_ASSINATURAS).createSignedUrl(caminho, 600);
  return data?.signedUrl ?? null;
}
