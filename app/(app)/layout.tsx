import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { fetchSettings } from "@/lib/settings";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import MobileHeader from "@/components/MobileHeader";
import QuickActionsButton from "@/components/QuickActionsButton";
import RegistrarServiceWorker from "@/components/RegistrarServiceWorker";
import AvisosDesligadosFaixa from "@/components/AvisosDesligadosFaixa";
import GuardarAgendaOffline from "@/components/GuardarAgendaOffline";
import ReciboHost from "@/components/ReciboHost";
import LembreteImportarFatura from "@/components/LembreteImportarFatura";
import { SomenteLeituraProvider } from "@/components/SomenteLeitura";
import EspacoSwitch from "@/components/EspacoSwitch";
import EspacoTema from "@/components/EspacoTema";

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

  // Perfil, faixa do modo teste e configurações de preço saem juntos (antes eram três idas
  // ao banco em fila, a cada tela).
  const [{ data: profile, error: profileError }, { data: testModeRow }, settings] = await Promise.all([
    supabase.from("profiles").select("name, permissions, is_admin, somente_leitura, cliente_id").eq("id", user.id).single(),
    supabase.from("settings").select("test_mode").eq("id", true).single(),
    fetchSettings(supabase),
  ]);

  // Login de cliente só tem o Planejador dela (/portal).
  if (profile?.cliente_id) redirect("/portal");

  const permissions = (profile?.permissions as Record<string, boolean>) ?? {};
  const isAdmin = !!profile?.is_admin;
  // Acesso só de visualização: sem avisos, sem "+", sem botões de alterar.
  const somenteLeitura = !!profile?.somente_leitura;
  // Chave Harmonize | Pessoal no topo, para quem tem o financeiro pessoal.
  const temPessoal = isAdmin || !!permissions.pessoal;
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
  const testMode = !!testModeRow?.test_mode;

  // Lançar locação direto pelo "+" (Pedido 1 da auditoria) precisa da
  // mesma config de preço/taxa que a ficha do cliente já usa (settings, acima).

  return (
    <SomenteLeituraProvider valor={somenteLeitura}>
    <div className="flex min-h-screen">
      {!somenteLeitura && <RegistrarServiceWorker />}
      <EspacoTema />
      <GuardarAgendaOffline />
      {!somenteLeitura && <ReciboHost />}
      {!somenteLeitura && <LembreteImportarFatura />}
      <Sidebar name={profile?.name ?? user.email ?? ""} permissions={permissions} isAdmin={isAdmin} />
      <main className="min-w-0 flex-1 pb-36 md:pb-0">
        <MobileHeader />
        {testMode && (
          <Link
            href="/configuracoes/dados-teste"
            className="block bg-amber-500 px-4 py-2 text-center text-xs font-semibold text-white"
          >
            MODO TESTE LIGADO · tudo que for criado agora não conta nos relatórios · toque para desligar
          </Link>
        )}
        {somenteLeitura && (
          <div className="bg-neutral-800 px-4 py-1.5 text-center text-[11px] font-medium text-white">
            Modo visualização: dá para ver tudo, mas não alterar
          </div>
        )}
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
          {!somenteLeitura && <AvisosDesligadosFaixa />}
          {temPessoal && <EspacoSwitch />}
          {children}
        </div>
      </main>
      <BottomNav permissions={permissions} isAdmin={isAdmin} permissionsLoaded={permissionsLoaded} />
      {!somenteLeitura && (
        <QuickActionsButton
          permissions={permissions}
          isAdmin={isAdmin}
          pricingConfig={settings.pricing}
          reservationFee={settings.reservationFee}
        />
      )}
    </div>
    </SomenteLeituraProvider>
  );
}
