"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Fingerprint } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { digitalSuportada, mensagemErroDigital } from "@/lib/digital";
import { aplicarTema, lerTemaGuardado } from "@/lib/tema";
import AparelhoHipro from "@/components/ui/AparelhoHipro";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [temDigital, setTemDigital] = useState(false);

  useEffect(() => {
    setTemDigital(digitalSuportada());
    // O tema é do aparelho: vale já no login (cor da barra do celular inclusa).
    aplicarTema(lerTemaGuardado());
  }, []);

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
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.28em] text-neutral-700">
          <span className="mr-2 inline-block h-px w-8 bg-[#51d3da]/70 align-middle" />
          Locação HIPRO 1 e HIPRO 2
          <span className="ml-2 inline-block h-px w-8 bg-[#51d3da]/70 align-middle" />
        </p>
        <AparelhoHipro className="mx-auto -mb-6 mt-2 w-[min(19rem,80vw)]" />
      </div>
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
          <input
            type="password"
            required
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
    </div>
  );
}
