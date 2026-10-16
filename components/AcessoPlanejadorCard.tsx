"use client";

// Acesso da cliente ao Planejador (portal): formulário feito uma vez por
// cliente. Completa o cadastro (e-mail, WhatsApp, endereço), cria o login com
// senha inicial e libera pelo liberar_acesso_planejador. Ela entra no mesmo
// endereço do sistema e cai direto no Planejador dela (/portal).

import { useCallback, useEffect, useState } from "react";
import { problemaSenha } from "@/lib/senha";
import { createClient as criarClienteSupabase } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";
import { buildWhatsAppLink, toUpperOrNull } from "@/lib/format";
import { saudacaoCurta } from "@/lib/saudacao";
import { Check, ClipboardList, Copy, MessageCircle } from "lucide-react";

interface ClienteAcesso {
  id: string;
  name: string;
  treatment?: string | null;
  display_name?: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
}

interface Validade {
  ultimo_atendimento: string | null;
  liberado_ate: string | null;
  valido_ate: string | null;
  ativo: boolean;
}

const dataBr = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

interface Acesso {
  id: string;
  email: string;
  active: boolean;
}

function senhaAleatoria() {
  const letras = "abcdefghjkmnpqrstuvwxyz";
  const n = new Uint32Array(8);
  crypto.getRandomValues(n);
  const l = Array.from(n.slice(0, 4), (v) => letras[v % letras.length]).join("");
  const d = Array.from(n.slice(4), (v) => String(v % 10)).join("");
  return l.charAt(0).toUpperCase() + l.slice(1) + d;
}

export default function AcessoPlanejadorCard({ cliente, onCadastroAtualizado }: { cliente: ClienteAcesso; onCadastroAtualizado?: () => void }) {
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [validade, setValidade] = useState<Validade | null>(null);
  const [liberando, setLiberando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [tratamento, setTratamento] = useState(cliente.treatment ?? "");
  const [nome, setNome] = useState(cliente.display_name ?? "");
  const [email, setEmail] = useState(cliente.email ?? "");
  const [whatsapp, setWhatsapp] = useState(cliente.whatsapp ?? "");
  const [endereco, setEndereco] = useState(cliente.address ?? "");
  const [cidade, setCidade] = useState(cliente.city ?? "");
  const [senha, setSenha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState<{ email: string; senha: string; confirmar: boolean } | null>(null);
  const [copiado, setCopiado] = useState(false);

  const carregar = useCallback(async () => {
    const [{ data }, { data: v }] = await Promise.all([
      supabase.from("profiles").select("id, email, active").eq("cliente_id", cliente.id).order("email"),
      supabase.rpc("portal_validade_cliente", { p_client_id: cliente.id }),
    ]);
    setAcessos((data ?? []) as Acesso[]);
    setValidade((v as Validade | null) ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (somenteLeitura) return null;

  function abrir() {
    setErro(null);
    setPronto(null);
    setSenha(senhaAleatoria());
    setAberto(true);
  }

  async function criar() {
    setErro(null);
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setErro("Informe um e-mail válido.");
    const ruimSenha = problemaSenha(senha);
    if (ruimSenha) return setErro(ruimSenha);
    setOcupado(true);

    // 1) Completa o cadastro com o que foi preenchido.
    const { error: erroCadastro } = await supabase
      .from("clients")
      .update({
        treatment: tratamento || null,
        display_name: nome.trim() || null,
        email: e,
        whatsapp: whatsapp.trim() || null,
        address: toUpperOrNull(endereco),
        city: toUpperOrNull(cidade),
      })
      .eq("id", cliente.id);
    if (erroCadastro) {
      setOcupado(false);
      return setErro("Não consegui salvar o cadastro. Tente de novo.");
    }
    onCadastroAtualizado?.();

    // 2) Login dela, num cliente à parte (não troca o seu login neste aparelho).
    const avulso = criarClienteSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "harmonize-cadastro-avulso" },
    });
    const { data, error } = await avulso.auth.signUp({ email: e, password: senha, options: { emailRedirectTo: `${window.location.origin}/login` } });
    const jaExistia = !!error && /already|registered|existe/i.test(error.message);
    if (error && !jaExistia) {
      setOcupado(false);
      return setErro(`Não consegui criar o login (${error.message}).`);
    }

    // 3) Libera só o Planejador dela.
    const { error: erroLibera } = await supabase.rpc("liberar_acesso_planejador", { p_email: e, p_client_id: cliente.id });
    setOcupado(false);
    if (erroLibera) return setErro(erroLibera.message);
    setPronto({ email: e, senha: jaExistia ? "" : senha, confirmar: !!data?.user && !data.session });
    setAberto(false);
    carregar();
  }

  // Validade: 60 dias ao liberar, 45 depois de cada atendimento; passou, trava. O dono libera por mais 60.
  async function liberar60() {
    setErro(null);
    setLiberando(true);
    const { error } = await supabase.rpc("liberar_portal_cliente", { p_client_id: cliente.id, p_dias: 60 });
    setLiberando(false);
    if (error) return setErro(error.message);
    carregar();
  }

  async function remover(a: Acesso) {
    if (!window.confirm(`Tirar o acesso de ${a.email} ao Planejador?`)) return;
    setErro(null);
    const { error } = await supabase.rpc("remover_acesso_planejador", { p_user_id: a.id });
    if (error) return setErro(error.message);
    carregar();
  }

  async function religar(a: Acesso) {
    setErro(null);
    const { error } = await supabase.rpc("liberar_acesso_planejador", { p_email: a.email, p_client_id: cliente.id });
    if (error) return setErro(error.message);
    carregar();
  }

  const mensagem = pronto
    ? [
        `${saudacaoCurta({ name: cliente.name, treatment: tratamento, displayName: nome })} Liberei seu acesso ao Planejador HIPRO da Harmonize.`,
        "",
        `Entre em: ${typeof window !== "undefined" ? window.location.origin : ""}/login`,
        `E-mail: ${pronto.email}`,
        pronto.senha ? `Senha: ${pronto.senha}` : "Senha: a mesma que você já usa",
        pronto.confirmar ? "\nAntes, confirme o cadastro no e-mail que chegou para você." : "",
        "\nDepois de entrar, você pode trocar a senha no ícone da chave, no topo.",
      ]
        .filter((l) => l !== "")
        .join("\n")
    : "";
  const linkWhats = pronto ? buildWhatsAppLink(whatsapp, mensagem) : null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sem permissão de copiar
    }
  }

  const campo = "mt-0.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal-dark">
            <ClipboardList size={17} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-sm font-medium text-neutral-900">Acesso ao Planejador</p>
            <p className="text-xs text-neutral-500">Ela entra com login próprio e vê só os planejamentos dela.</p>
          </div>
        </div>
        {!aberto && (
          <button onClick={abrir} className="flex-shrink-0 rounded-lg border border-brand-teal/40 bg-brand-teal/10 px-3 py-1.5 text-xs font-semibold text-brand-teal-dark">
            {acessos.length ? "Novo login" : "Dar acesso"}
          </button>
        )}
      </div>

      {acessos.some((x) => x.active) && validade && (
        <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${validade.ativo ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {validade.ativo ? (
            <p>
              Acesso liberado até <b>{dataBr(validade.valido_ate)}</b>
              {validade.liberado_ate && validade.liberado_ate === validade.valido_ate
                ? " (prazo da liberação)."
                : validade.ultimo_atendimento
                ? ` (45 dias depois do atendimento de ${dataBr(validade.ultimo_atendimento)}).`
                : "."}
            </p>
          ) : (
            <p>
              <b>Acesso pausado</b>: passou do prazo
              {validade.ultimo_atendimento ? ` (último em ${dataBr(validade.ultimo_atendimento)})` : ""}. Ela vê o aviso para falar com você.
            </p>
          )}
          <button onClick={liberar60} disabled={liberando} className="mt-1.5 font-semibold underline disabled:opacity-60">
            {liberando ? "Liberando..." : "Liberar por mais 60 dias"}
          </button>
        </div>
      )}

      {acessos.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {acessos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="min-w-0 truncate text-neutral-700">
                {a.email}
                {!a.active && <span className="ml-1 text-neutral-400">(desligado)</span>}
              </span>
              {a.active ? (
                <button onClick={() => remover(a)} className="flex-shrink-0 font-medium text-rose-600">
                  Tirar acesso
                </button>
              ) : (
                <button onClick={() => religar(a)} className="flex-shrink-0 font-medium text-brand-teal-dark">
                  Religar
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {aberto && (
        <div className="mt-3 space-y-2.5">
          <p className="text-xs text-neutral-500">Confira os dados dela. O que mudar aqui também atualiza o cadastro.</p>
          <div className="grid grid-cols-[90px_1fr] gap-2">
            <label className="text-[11px] text-neutral-500">
              Tratamento
              <select value={tratamento} onChange={(e) => setTratamento(e.target.value)} className={campo}>
                <option value="">-</option>
                <option value="Dra.">Dra.</option>
                <option value="Dr.">Dr.</option>
              </select>
            </label>
            <label className="text-[11px] text-neutral-500">
              Nome (como ela é chamada)
              <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Raquel" className={campo} />
            </label>
          </div>
          <label className="block text-[11px] text-neutral-500">
            E-mail (vira o login)
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email" autoComplete="off" className={campo} />
          </label>
          <label className="block text-[11px] text-neutral-500">
            WhatsApp
            <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} inputMode="tel" className={campo} />
          </label>
          <label className="block text-[11px] text-neutral-500">
            Endereço
            <input value={endereco} onChange={(e) => setEndereco(e.target.value)} className={campo} />
          </label>
          <label className="block text-[11px] text-neutral-500">
            Cidade
            <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} />
          </label>
          <label className="block text-[11px] text-neutral-500">
            Senha inicial (ela troca depois)
            <div className="flex gap-2">
              <input value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="off" className={campo} />
              <button type="button" onClick={() => setSenha(senhaAleatoria())} className="mt-0.5 flex-shrink-0 rounded-lg border border-neutral-300 px-3 text-xs text-neutral-600">
                Outra
              </button>
            </div>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setAberto(false)} className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-600">
              Cancelar
            </button>
            <button onClick={criar} disabled={ocupado} className="flex-1 rounded-lg bg-brand-gradient px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {ocupado ? "Criando..." : "Criar acesso"}
            </button>
          </div>
        </div>
      )}

      {pronto && (
        <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800">
            <Check size={14} /> Acesso liberado. Mande os dados para ela:
          </p>
          <pre className="whitespace-pre-wrap rounded-lg bg-white px-3 py-2 font-sans text-xs text-neutral-700">{mensagem}</pre>
          <div className="grid grid-cols-2 gap-2">
            {linkWhats ? (
              <a href={linkWhats} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">
                <MessageCircle size={13} /> WhatsApp
              </a>
            ) : (
              <span className="flex items-center justify-center text-[11px] text-neutral-400">sem WhatsApp</span>
            )}
            <button onClick={copiar} className="flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700">
              <Copy size={13} /> {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>
        </div>
      )}

      {erro && <p className="mt-2 text-xs text-rose-600">{erro}</p>}
    </div>
  );
}
