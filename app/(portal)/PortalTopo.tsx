"use client";

import CampoSenha from "@/components/CampoSenha";
import { useState } from "react";
import { problemaSenha, REGRA_SENHA } from "@/lib/senha";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { KeyRound, LogOut, UsersRound, X } from "lucide-react";
import ProfissionaisCliente from "@/components/planejador/ProfissionaisCliente";

export default function PortalTopo({ nome, clienteId }: { nome: string; clienteId?: string | null }) {
  const supabase = createClient();
  const router = useRouter();
  const [trocando, setTrocando] = useState(false);
  const [equipe, setEquipe] = useState(false);
  const [senha, setSenha] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function salvarSenha() {
    setAviso(null);
    const ruimSenha = problemaSenha(senha);
    if (ruimSenha) return setAviso(ruimSenha);
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
          {clienteId && (
            <button onClick={() => setEquipe((v) => !v)} aria-label="Profissionais da clínica" title="Profissionais da clínica" className="inline-flex items-center gap-1 text-xs font-semibold hover:text-brand-teal-dark">
              <UsersRound size={17} /> <span className="hidden sm:inline">Profissionais</span>
            </button>
          )}
          <button onClick={() => setTrocando((v) => !v)} aria-label="Trocar senha" className="hover:text-brand-teal-dark">
            <KeyRound size={17} />
          </button>
          <button onClick={sair} aria-label="Sair" className="hover:text-rose-600">
            <LogOut size={17} />
          </button>
        </div>
      </div>
      {equipe && clienteId && (
        <div className="mx-auto max-w-6xl px-4 pb-3 md:px-8">
          <div className="relative rounded-2xl border border-neutral-200 bg-white p-4">
            <button onClick={() => setEquipe(false)} aria-label="Fechar" className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-500">
              <X size={15} />
            </button>
            <ProfissionaisCliente clienteId={clienteId} portal semMoldura />
            <p className="mt-2 text-[11px] text-neutral-500">Quem você cadastrar aqui aparece para escolher no campo Profissional do planejamento.</p>
          </div>
        </div>
      )}
      {(trocando || aviso) && (
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pb-2.5 md:px-8">
          {trocando && (
            <>
              <span className="min-w-0 flex-1">
                <CampoSenha
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  placeholder="Nova senha"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
                />
              </span>
              <button onClick={salvarSenha} className="rounded-lg bg-brand-gradient px-3 py-1.5 text-sm font-semibold text-white">
                Salvar
              </button>
            </>
          )}
          {trocando && !aviso && <p className="w-full text-[11px] text-neutral-400">{REGRA_SENHA}</p>}
          {aviso && <p className="w-full text-xs text-neutral-500">{aviso}</p>}
        </div>
      )}
    </header>
  );
}
