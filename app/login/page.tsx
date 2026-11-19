"use client";

import CampoSenha from "@/components/CampoSenha";
import { useEffect, useState, type FormEvent } from "react";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { digitalSuportada, mensagemErroDigital } from "@/lib/digital";
import { aplicarTema, lerTemaGuardado } from "@/lib/tema";
import AparelhoHipro from "@/components/ui/AparelhoHipro";
import { CAMINHO_REDEFINIR, clienteDeRecuperacao, ehLinkDeRecuperacao } from "@/lib/recuperar-senha";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [temDigital, setTemDigital] = useState(false);
  const [modo, setModo] = useState<"entrar" | "esqueci">("entrar");
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    setTemDigital(digitalSuportada());
    // O tema é do aparelho: vale já no login (cor da barra do celular inclusa).
    aplicarTema(lerTemaGuardado());
    // Se o endereço de redefinição do e-mail caiu aqui (endereço não liberado no Supabase), leva para a tela certa.
    if (ehLinkDeRecuperacao(window.location.hash)) window.location.replace(`${CAMINHO_REDEFINIR}${window.location.hash}`);
  }, []);

  async function pedirNovaSenha(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await clienteDeRecuperacao().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${CAMINHO_REDEFINIR}`,
    });
    setLoading(false);
    if (error) {
      setError(/rate limit|seconds/i.test(error.message) ? "Muitos pedidos seguidos. Espere alguns minutos e tente de novo." : "Não foi possível enviar agora. Tente de novo em instantes.");
      return;
    }
    // Mesma resposta exista o e-mail ou não, para não revelar quem tem cadastro.
    setEnviado(true);
  }

  async function entrarComDigital() {
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPasskey();
    setLoading(false);
    if (error) {
      const msg = mensagemErroDigital(error);
      if (msg !== "Cancelado.") setError(msg);
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="bg-brand-mesh flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-8">
      {/* Tema HIPRO: o aparelho como herói, como na capa do e-book. */}
      <div className="so-hipro mb-4 w-full max-w-sm text-center">
        <img src="/harmonize-logo-full-dark.png" alt="" aria-hidden className="mx-auto h-14 w-auto" />
        <AparelhoHipro className="mx-auto -mb-6 mt-4 w-[min(19rem,80vw)]" />
      </div>
      {modo === "esqueci" ? (
        <form onSubmit={pedirNovaSenha} className="w-full max-w-sm space-y-4 rounded-3xl border border-white/60 bg-white p-8 shadow-2xl shadow-brand-teal/10">
          <div className="mb-2 flex flex-col items-center text-center">
            <img src="/harmonize-logo-full.png" alt="Harmonize" className="h-16 w-auto" />
            <p className="mt-2 text-sm text-neutral-500">Esqueci minha senha</p>
          </div>
          {enviado ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
              Se este e-mail tem cadastro, enviamos um link para criar uma senha nova. Confira também a caixa de spam. O link vale por pouco tempo.
            </p>
          ) : (
            <>
              <p className="text-sm text-neutral-600">Digite o e-mail do seu cadastro. Vamos enviar um link para você criar uma senha nova.</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal disabled:opacity-60"
              >
                {loading ? "Enviando..." : "Enviar link"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              setModo("entrar");
              setEnviado(false);
              setError(null);
            }}
            className="block w-full text-center text-sm font-medium text-brand-teal"
          >
            Voltar para a entrada
          </button>
        </form>
      ) : (
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-3xl border border-white/60 bg-white p-8 shadow-2xl shadow-brand-teal/10"
      >
        <div className="mb-2 flex flex-col items-center text-center">
          <img src="/harmonize-logo-full.png" alt="Harmonize" className="fora-hipro h-16 w-auto" />
          <p className="so-hipro pilula-hipro rounded-full px-5 py-1 text-sm font-bold uppercase tracking-[0.12em] text-white">Harmonize OS</p>
          <p className="mt-2 text-sm text-neutral-500">Entre para continuar</p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">E-mail</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">Senha</label>
          <CampoSenha
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand-teal focus:outline-none focus:ring-1 focus:ring-brand-teal"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-gradient py-2.5 text-sm font-medium text-white shadow-glow-teal transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? "Entrando..." : "Entrar"}
        </button>

        <button
          type="button"
          onClick={() => {
            setModo("esqueci");
            setError(null);
          }}
          className="block w-full text-center text-sm font-medium text-brand-teal"
        >
          Esqueci minha senha
        </button>

        {temDigital && (
          <button
            type="button"
            onClick={entrarComDigital}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-teal py-2.5 text-sm font-medium text-brand-teal disabled:opacity-60"
          >
            <Fingerprint size={16} />
            Entrar com a digital
          </button>
        )}
      </form>
      )}
    </div>
  );
}
