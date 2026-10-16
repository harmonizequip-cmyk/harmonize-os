import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PortalTopo from "./PortalTopo";
import { clienteDoPortal } from "./portal/carregar";

// Portal da cliente: login de cliente (profiles.cliente_id) vê só o
// Planejador dela. Quem não é login de cliente volta para o sistema.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await supabase.from("profiles").select("cliente_id, active").eq("id", user.id).maybeSingle();
  if (!perfil?.cliente_id) redirect("/dashboard");
  const cliente = perfil.active ? await clienteDoPortal(supabase) : null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <PortalTopo nome={cliente?.profissional ?? user.email ?? ""} />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {cliente ? (
          children
        ) : (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-600">
            Seu acesso ao Planejador está desligado. Fale com a Harmonize.
          </div>
        )}
      </div>
    </div>
  );
}
