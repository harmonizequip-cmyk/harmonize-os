import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { carregarAvisosAbertos, podeVerAvisos } from "@/lib/carregar-pendencias";
import type { Notificacao } from "@/lib/notificacoes";
import AvisosClient from "./AvisosClient";

// Tela de Avisos (sino do topo): o que precisa de você agora (mesma lista do
// Dashboard, inteira) e o histórico das notificações que chegaram no celular.
export const dynamic = "force-dynamic";

export default async function AvisosPage() {
  if (!(await podeVerAvisos())) redirect("/dashboard");
  const supabase = createClient();
  const [abertos, hist] = await Promise.all([
    carregarAvisosAbertos(),
    supabase.from("notificacoes").select("id, tipo, titulo, texto, url, criada_em, lida_em").order("criada_em", { ascending: false }).limit(150),
  ]);
  const faltaSql = !!hist.error && /notificacoes/.test(hist.error.message);
  return (
    <AvisosClient
      avisos={abertos.avisos}
      notificacoes={(hist.data ?? []) as Notificacao[]}
      erroHistorico={hist.error ? (faltaSql ? "Falta rodar o SQL do histórico de notificações." : hist.error.message) : null}
    />
  );
}
