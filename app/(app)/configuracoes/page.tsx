import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import MobileHeader from "@/components/MobileHeader";
import QuickActionsButton from "@/components/QuickActionsButton";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("name, permissions, is_admin")
    .eq("id", user.id)
    .single();

  const permissions = (profile?.permissions as Record<string, boolean>) ?? {};
  const isAdmin = !!profile?.is_admin;
  // Distingue "usuário sem essa permissão" (permissions/is_admin vieram e diziam
  // que não pode) de "não deu pra saber" (a query falhou/voltou vazia). Sem essa
  // distinção, qualquer falha temporária ao buscar o perfil faz o menu inteiro
  // desaparecer silenciosamente, como se o usuário não tivesse acesso a nada.
  const permissionsLoaded = !profileError && !!profile;

  // Aviso de modo teste. Esquecer a chave ligada é o jeito mais fácil de
  // uma venda real virar teste e sumir dos relatórios, então o aviso
  // aparece em todas as telas, não só em Configurações. O select falha
  // silenciosamente enquanto a migração do modo teste não tiver rodado,
  // e nesse caso simplesmente não há faixa nenhuma.
  const { data: testModeRow } = await supabase.from("settings").select("test_mode").eq("id", true).single();
  const testMode = !!testModeRow?.test_mode;

  return (
    <div className="flex min-h-screen">
      <Sidebar name={profile?.name ?? user.email ?? ""} permissions={permissions} isAdmin={isAdmin} />
      <main className="flex-1 pb-20 md:pb-0">
        <MobileHeader />
        {testMode && (
          <Link
            href="/configuracoes/dados-teste"
            className="block bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white"
          >
            MODO TESTE LIGADO · tudo que for criado agora não conta nos relatórios · toque para desligar
          </Link>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</div>
      </main>
      <BottomNav permissions={permissions} isAdmin={isAdmin} permissionsLoaded={permissionsLoaded} />
      <QuickActionsButton permissions={permissions} isAdmin={isAdmin} />
    </div>
  );
}
