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
  // Validade: 60 dias ao liberar, 45 depois de cada atendimento (portal_situacao, no banco).
  const { data: situacao } = cliente ? { data: null } : await supabase.rpc("portal_situacao");
  const s = situacao as { desligado?: boolean; ultimo_atendimento?: string | null } | null;
  const dataBr = (iso?: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : null);

  return (
    <div className="min-h-screen bg-neutral-50">
      <PortalTopo nome={cliente?.profissional ?? user.email ?? ""} />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
        {cliente ? (
          children
        ) : (
          <div className="mx-auto max-w-md space-y-2 rounded-2xl border border-neutral-200 bg-white p-6 text-center">
            <p className="text-3xl">🔒</p>
            {s && !s.desligado ? (
              <>
                <p className="text-sm font-semibold text-neutral-900">Seu acesso ao Planejador está pausado</p>
                <p className="text-sm text-neutral-600">
                  O acesso fica liberado até 45 dias depois do último atendimento
                  {dataBr(s.ultimo_atendimento) ? ` (o seu foi em ${dataBr(s.ultimo_atendimento)})` : ""}. Fale com a Harmonize para
                  liberar. Seus planejamentos continuam guardados.
                </p>
              </>
            ) : (
              <p className="text-sm text-neutral-600">Seu acesso ao Planejador está desligado. Fale com a Harmonize.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
