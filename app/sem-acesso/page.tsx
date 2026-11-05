import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { destinoDoLogin, mensagemPedirAcesso } from "@/lib/acesso";
import { buildWhatsAppLink } from "@/lib/format";
import SairBotao from "./SairBotao";

// Quem entrou mas não tem acesso liberado (login criado pelo formulário ainda
// esperando a Harmonize, perfil desligado, sem permissão ou erro ao ler o
// perfil). Nada da Harmonize aparece aqui. Dono e equipe com acesso voltam ao
// sistema; login de cliente vai ao portal.
export const metadata = { title: "Acesso | Harmonize" };
export const dynamic = "force-dynamic";

export default async function SemAcessoPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil, error } = await supabase
    .from("profiles")
    .select("name, is_admin, active, somente_leitura, cliente_id, permissions")
    .eq("id", user.id)
    .maybeSingle();
  const destino = destinoDoLogin(perfil, !!error);
  if (destino === "harmonize") redirect("/dashboard");
  if (destino === "portal") redirect("/portal");

  const { data: zap } = await supabase.rpc("contato_harmonize");
  const tipo = perfil && perfil.active === false ? "desligado" : "aguardando";
  const link = typeof zap === "string" && zap ? buildWhatsAppLink(zap, mensagemPedirAcesso(tipo, perfil?.name ?? null, user.email ?? null)) : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/harmonize-logo-full.png" alt="Harmonize" className="mx-auto h-10 w-auto" />
        <p className="text-base font-semibold text-neutral-900">
          {error ? "Não consegui confirmar o seu acesso" : tipo === "desligado" ? "Seu acesso está desligado" : "Seu cadastro está aguardando liberação"}
        </p>
        <p className="text-sm text-neutral-600">
          {error
            ? "Confira a internet e tente de novo. Se continuar, fale com a Harmonize."
            : tipo === "desligado"
              ? "Fale com a Harmonize para pedir um novo acesso."
              : "Assim que a Harmonize liberar, você entra com este e-mail e a sua senha."}
        </p>
        <p className="text-xs text-neutral-500">Entrou como {user.email}</p>
        {link && (
          <a href={link} target="_blank" rel="noopener noreferrer" className="flex min-h-12 w-full items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white">
            Pedir acesso à Harmonize no WhatsApp
          </a>
        )}
        <SairBotao />
      </div>
    </div>
  );
}
