import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/BottomNav";
import MobileHeader from "@/components/MobileHeader";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, permissions, is_admin")
    .eq("id", user.id)
    .single();

  const permissions = (profile?.permissions as Record<string, boolean>) ?? {};
  const isAdmin = !!profile?.is_admin;

  return (
    <div className="flex min-h-screen">
      <Sidebar name={profile?.name ?? user.email ?? ""} permissions={permissions} isAdmin={isAdmin} />
      <main className="flex-1 pb-20 md:pb-0">
        <MobileHeader />
        <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">{children}</div>
      </main>
      <BottomNav permissions={permissions} isAdmin={isAdmin} />
    </div>
  );
}
