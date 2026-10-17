"use client";

// Acesso só de visualização (ex.: esposa do dono): cria o login com e-mail e
// senha e libera o perfil marcado somente_leitura. Ela vê tudo, menos
// Configurações, e o banco recusa qualquer alteração vinda dela.

import { useCallback, useEffect, useState } from "react";
import { problemaSenha } from "@/lib/senha";
import { Eye } from "lucide-react";
import { createClient as criarClienteSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { confirmar } from "@/components/Dialogos";

interface Acesso {
  id: string;
  name: string;
  email: string;
  active: boolean;
}

export default function AcessoVisualizacaoCard() {
  const supabase = createClient();
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("profiles").select("id, name, email, active").eq("somente_leitura", true).order("name");
    setAcessos((data ?? []) as Acesso[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criar() {
    setErro(null);
    setMensagem(null);
    const e = email.trim().toLowerCase();
    if (!e || !nome.trim()) return setErro("Preencha nome e e-mail.");
    const ruimSenha = senha ? problemaSenha(senha) : null;
    if (ruimSenha) return setErro(ruimSenha);
    setOcupado(true);
    let precisaConfirmar = false;
    if (senha) {
      // Cliente à parte, sem guardar sessão: criar o login dela não pode
      // trocar o seu login neste aparelho.
      const avulso = criarClienteSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "harmonize-cadastro-avulso" },
      });
      const { data, error } = await avulso.auth.signUp({
        email: e,
        password: senha,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error && !/already|registered|existe/i.test(error.message)) {
        setOcupado(false);
        return setErro(
          `Não consegui criar o login (${error.message}). Crie no painel do Supabase (Authentication > Users > Add user) e volte aqui com a senha em branco.`
        );
      }
      precisaConfirmar = !!data?.user && !data.session;
    }
    const { error } = await supabase.rpc("liberar_acesso_visualizacao", { p_email: e, p_nome: nome.trim() });
    setOcupado(false);
    if (error) return setErro(error.message);
    setMensagem(
      precisaConfirmar
        ? `Acesso liberado. Chegou um e-mail para ${e} confirmar o cadastro; depois é só entrar com o e-mail e a senha.`
        : `Acesso liberado. ${nome.trim()} já pode entrar com o e-mail e a senha.`
    );
    setNome("");
    setEmail("");
    setSenha("");
    setAberto(false);
    carregar();
  }

  async function remover(a: Acesso) {
    if (!(await confirmar({ titulo: `Tirar o acesso de ${a.name}?`, confirmar: "Tirar acesso", perigo: true }))) return;
    setErro(null);
    const { error } = await supabase.rpc("remover_acesso_visualizacao", { p_user_id: a.id });
    if (error) return setErro(error.message);
    carregar();
  }

  async function religar(a: Acesso) {
    setErro(null);
    const { error } = await supabase.rpc("liberar_acesso_visualizacao", { p_email: a.email, p_nome: a.name });
    if (error) return setErro(error.message);
    carregar();
  }

  const campo =
    "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
          <Eye size={17} strokeWidth={1.75} />
        </span>
        <div>
          <p className="text-sm font-medium text-neutral-900">Acesso só de visualização</p>
          <p className="text-xs text-neutral-500">Vê tudo (menos Configurações), sem poder alterar nada e sem avisos.</p>
        </div>
      </div>

      {acessos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {acessos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-neutral-700">
                {a.name} · {a.email}
                {!a.active && <span className="ml-1 text-neutral-400">(sem acesso)</span>}
              </span>
              {a.active ? (
                <button type="button" onClick={() => remover(a)} className="text-[11px] text-red-600 underline">
                  tirar acesso
                </button>
              ) : (
                <button type="button" onClick={() => religar(a)} className="text-[11px] text-brand-teal underline">
                  devolver acesso
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {aberto ? (
        <div className="mt-3 space-y-2">
          <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome" className={campo} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" inputMode="email" className={campo} />
          <input
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha (8+, maiúscula e número)"
            type="password"
            className={campo}
          />
          <p className="text-[11px] text-neutral-400">Se o login já existir, deixe a senha em branco.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="flex-1 rounded-lg border border-neutral-300 py-2 text-xs text-neutral-600"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={ocupado}
              onClick={criar}
              className="flex-1 rounded-lg bg-brand-teal py-2 text-xs font-medium text-white disabled:opacity-60"
            >
              {ocupado ? "Liberando..." : "Liberar acesso"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAberto(true);
            setMensagem(null);
          }}
          className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700"
        >
          + Dar acesso de visualização
        </button>
      )}
      {mensagem && <p className="mt-2 text-xs text-brand-teal">{mensagem}</p>}
      {erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
    </div>
  );
}
