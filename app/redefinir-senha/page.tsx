"use client";

// Tela aberta pelo link do e-mail "Esqueci minha senha": a pessoa escolhe a senha nova.

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import CampoSenha from "@/components/CampoSenha";
import { REGRA_SENHA, problemaSenha } from "@/lib/senha";
import { clienteDeRecuperacao, ehLinkDeRecuperacao, erroDoLink } from "@/lib/recuperar-senha";

type Fase = "verificando" | "pronto" | "invalido" | "feito";

export default function RedefinirSenhaPage() {
  const cliente = useRef<ReturnType<typeof clienteDeRecuperacao> | null>(null);
  const [fase, setFase] = useState<Fase>("verificando");
  const [aviso, setAviso] = useState<string | null>(null);
  const [senha, setSenha] = useState("");
  const [repetir, setRepetir] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    const c = clienteDeRecuperacao();
    cliente.current = c;
    const erroLink = erroDoLink(hash);
    if (erroLink || !ehLinkDeRecuperacao(hash)) {
      setAviso(erroLink ?? "Este link não é válido. Peça um novo na tela de entrada.");
      setFase("invalido");
      return;
    }
    // O cliente lê o token do endereço sozinho; confirma que a sessão de recuperação abriu.
    const { data } = c.auth.onAuthStateChange((evento, sessao) => {
      if ((evento === "PASSWORD_RECOVERY" || evento === "SIGNED_IN" || evento === "INITIAL_SESSION") && sessao) setFase("pronto");
    });
    const t = setTimeout(() => {
      setFase((f) => {
        if (f === "verificando") {
          setAviso("Não foi possível abrir este link. Peça um novo na tela de entrada.");
          return "invalido";
        }
        return f;
      });
    }, 6000);
    return () => {
      clearTimeout(t);
      data.subscription.unsubscribe();
    };
  }, []);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    const problema = problemaSenha(senha);
    if (problema) return setErro(problema);
    if (senha !== repetir) return setErro("As duas senhas precisam ser iguais.");
    if (!cliente.current) return;
    setSalvando(true);
    const { error } = await cliente.current.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro(/same|different/i.test(error.message) ? "Escolha uma senha diferente da anterior." : "Não foi possível salvar. Peça um novo link e tente de novo.");
      return;
    }
    await cliente.current.auth.signOut();
    window.history.replaceState(null, "", window.location.pathname);
    setFase("feito");
  }

  return (
    <div className="bg-brand-mesh flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-8">
      <div className="w-full max-w-sm space-y-4 rounded-3xl border border-white/60 bg-white p-8 shadow-2xl shadow-brand-teal/10">
        <div className="flex flex-col items-center text-center">
          <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-16 w-auto" />
          <p className="mt-2 text-sm text-neutral-500">Criar uma senha nova</p>
        </div>

        {fase === "verificando" && <p className="text-center text-sm text-neutral-500">Abrindo o link...</p>}

        {fase === "invalido" && (
          <>
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{aviso}</p>
            <Link href="/login" className="block w-full rounded-xl bg-brand-gradient py-2.5 text-center text-sm font-medium text-white">
              Voltar para a entrada
            </Link>
          </>
        )}

        {fase === "pronto" && (
          <form onSubmit={salvar} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Senha nova</label>
              <CampoSenha
                required
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
              <p className="mt-1 text-xs text-neutral-500">{REGRA_SENHA}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-neutral-700">Repita a senha</label>
              <CampoSenha
                required
                autoComplete="new-password"
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
              />
            </div>
            {erro && <p className="text-sm text-red-600">{erro}</p>}
            <button
              type="submit"
              disabled={salvando}
              className="w-full rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal disabled:opacity-60"
            >
              {salvando ? "Salvando..." : "Salvar senha nova"}
            </button>
          </form>
        )}

        {fase === "feito" && (
          <>
            <p className="flex items-center justify-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={18} /> Senha nova salva.
            </p>
            <Link href="/login" className="block w-full rounded-xl bg-brand-gradient py-2.5 text-center text-sm font-medium text-white">
              Entrar
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
