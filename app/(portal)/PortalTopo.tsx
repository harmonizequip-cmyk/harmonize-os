"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, LogOut } from "lucide-react";

export default function PortalTopo({ nome }: { nome: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [trocando, setTrocando] = useState(false);
  const [senha, setSenha] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function salvarSenha() {
    setAviso(null);
    if (senha.length < 6) return setAviso("A senha precisa ter pelo menos 6 caracteres.");
    const { error } = await supabase.auth.updateUser({ password: senha });
    if (error) return setAviso("Não consegui trocar a senha. Tente de novo.");
    setSenha("");
    setTrocando(false);
    setAviso("Senha trocada.");
  }

  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 md:px-8">
        <div className="flex min-w-0 items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-7 w-auto" />
          <span className="truncate text-xs text-neutral-500">Planejador · {nome}</span>
        </div>
        <div className="flex flex-shrink-0 items-center gap-3 text-neutral-500">
          <button onClick={() => setTrocando((v) => !v)} aria-label="Trocar senha" className="hover:text-brand-teal-dark">
            <KeyRound size={17} />
          </button>
          <button onClick={sair} aria-label="Sair" className="hover:text-rose-600">
            <LogOut size={17} />
          </button>
        </div>
      </div>
      {(trocando || aviso) && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-2.5 md:px-8">
          {trocando && (
            <>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Nova senha"
                autoComplete="new-password"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
              />
              <button onClick={salvarSenha} className="rounded-lg bg-brand-gradient px-3 py-1.5 text-sm font-semibold text-white">
                Salvar
              </button>
            </>
          )}
          {aviso && <p className="w-full text-xs text-neutral-500">{aviso}</p>}
        </div>
      )}
    </header>
  );
}
