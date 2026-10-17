"use client";

// Minha conta: quem está entrado, trocar a senha e sair.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { problemaSenha, REGRA_SENHA } from "@/lib/senha";
import { avisar, confirmar } from "@/components/Dialogos";
import { Bloco } from "../ui";

export default function MinhaConta({ nome, email }: { nome: string; email: string }) {
  const supabase = createClient();
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [ver, setVer] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function trocar() {
    setErro(null);
    const ruim = problemaSenha(senha);
    if (ruim) return setErro(ruim);
    if (senha !== repetir) return setErro("As duas senhas não estão iguais.");
    setOcupado(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setOcupado(false);
    if (error) return setErro("Não consegui trocar a senha. Tente de novo.");
    setSenha("");
    setRepetir("");
    avisar("Senha trocada. A digital continua valendo.");
  }

  async function sair() {
    if (!(await confirmar({ titulo: "Sair do Harmonize?", texto: "Para entrar de novo: e-mail e senha, ou a digital.", confirmar: "Sair" }))) return;
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inicial = (nome || email || "?").trim().charAt(0).toUpperCase();

  return (
    <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-3xl bg-white p-4 ring-1 ring-neutral-200/80">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-brand-gradient text-lg font-extrabold text-white">
          {inicial}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-base font-bold text-neutral-900">{nome || "Sem nome"}</span>
          <span className="block truncate text-sm text-neutral-500">{email}</span>
        </span>
      </section>

      <Bloco titulo="Trocar a senha" dica={REGRA_SENHA}>
        <div className="space-y-2">
          <label className="flex items-center rounded-xl border border-neutral-300 focus-within:border-brand-teal">
            <input
              type={ver ? "text" : "password"}
              autoComplete="new-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Nova senha"
              className="min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
            />
            <button type="button" onClick={() => setVer((v) => !v)} className="px-3 text-neutral-400" aria-label={ver ? "Esconder senha" : "Mostrar senha"}>
              {ver ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </label>
          <input
            type={ver ? "text" : "password"}
            autoComplete="new-password"
            value={repetir}
            onChange={(e) => setRepetir(e.target.value)}
            placeholder="Repita a nova senha"
            className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm outline-none focus:border-brand-teal"
          />
          {erro && <p className="text-xs text-rose-600">{erro}</p>}
          <button
            type="button"
            onClick={trocar}
            disabled={ocupado || !senha}
            className="w-full rounded-xl bg-brand-gradient py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {ocupado ? "Trocando..." : "Trocar senha"}
          </button>
        </div>
      </Bloco>

      <button
        type="button"
        onClick={sair}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-sm font-semibold text-rose-600 ring-1 ring-neutral-200"
      >
        <LogOut size={16} /> Sair do Harmonize
      </button>
    </div>
  );
}
