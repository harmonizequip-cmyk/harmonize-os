"use client";

// Formulário que a cliente preenche sozinha (link /cadastro/<token>, sem login).
// Fala com a Edge Function "cadastro-cliente", que confere o token, cria o
// login com a senha dela e atualiza o cadastro. O acesso ao Planejador só
// abre quando a Harmonize liberar.

import { useEffect, useState } from "react";
import { problemaSenha, REGRA_SENHA } from "@/lib/senha";

const URL_FUNCAO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cadastro-cliente`;
const CABECALHOS = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" };

type Dados = {
  tratamento: string;
  nome_completo: string;
  nome_exibicao: string;
  whatsapp: string;
  email: string;
  documento: string;
  clinica: string;
  endereco: string;
  cidade: string;
  uf: string;
};

const VAZIO: Dados = { tratamento: "", nome_completo: "", nome_exibicao: "", whatsapp: "", email: "", documento: "", clinica: "", endereco: "", cidade: "", uf: "" };

export default function FormularioCadastro({ token }: { token: string }) {
  const [estado, setEstado] = useState<"carregando" | "invalido" | "form" | "enviado">("carregando");
  const [motivo, setMotivo] = useState("");
  const [d, setD] = useState<Dados>(VAZIO);
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [jaTinha, setJaTinha] = useState(false);

  useEffect(() => {
    fetch(`${URL_FUNCAO}?token=${encodeURIComponent(token)}`, { headers: CABECALHOS })
      .then((r) => r.json())
      .then((r) => {
        if (!r?.valido) {
          setMotivo(r?.motivo ?? "Link inválido.");
          setEstado("invalido");
          return;
        }
        setD((x) => ({
          ...x,
          tratamento: r.tratamento ?? "",
          nome_exibicao: r.nome_exibicao ?? "",
          whatsapp: r.whatsapp ?? "",
          email: r.email ?? "",
        }));
        setEstado("form");
      })
      .catch(() => {
        setMotivo("Não consegui abrir o cadastro. Confira a internet e tente de novo.");
        setEstado("invalido");
      });
  }, [token]);

  const mudar = (k: keyof Dados) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setD((x) => ({ ...x, [k]: e.target.value }));

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!d.nome_completo.trim() || !d.whatsapp.trim() || !d.email.trim()) return setErro("Preencha nome completo, WhatsApp e e-mail.");
    if (d.whatsapp.replace(/\D/g, "").length < 10) return setErro("Coloque o WhatsApp com DDD.");
    const ruim = problemaSenha(senha);
    if (ruim) return setErro(ruim);
    if (senha !== senha2) return setErro("As duas senhas não são iguais.");
    setEnviando(true);
    try {
      const r = await fetch(URL_FUNCAO, { method: "POST", headers: CABECALHOS, body: JSON.stringify({ token, dados: d, senha }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.ok) {
        setErro(j.erro ?? "Não consegui enviar. Tente de novo.");
        return;
      }
      setJaTinha(!!j.ja_tinha_login);
      setEstado("enviado");
    } catch {
      setErro("Não consegui enviar. Confira a internet e tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  const campo = "mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-base text-neutral-900";
  const rotulo = "block text-sm font-medium text-neutral-700";

  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/harmonize-logo-full.png" alt="Harmonize" className="mx-auto mb-6 h-10 w-auto" />

        {estado === "carregando" && <p className="text-center text-sm text-neutral-500">Abrindo o cadastro...</p>}

        {estado === "invalido" && (
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-700">{motivo}</div>
        )}

        {estado === "enviado" && (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-white p-6 text-center">
            <p className="text-3xl">✅</p>
            <p className="text-base font-semibold text-neutral-900">Cadastro enviado!</p>
            <p className="text-sm text-neutral-600">
              Assim que a Harmonize liberar, você entra em <b>harmonize-os.vercel.app</b> com o e-mail <b>{d.email.trim().toLowerCase()}</b>{" "}
              {jaTinha ? "e a senha que você já tinha." : "e a senha que acabou de criar."}
            </p>
          </div>
        )}

        {estado === "form" && (
          <form onSubmit={enviar} className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-5">
            <div>
              <h1 className="text-lg font-bold text-neutral-900">Cadastro</h1>
              <p className="text-sm text-neutral-500">Preencha seus dados e crie sua senha para acessar o Planejador HIPRO.</p>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-3">
              <label className={rotulo}>
                Tratamento
                <select value={d.tratamento} onChange={mudar("tratamento")} className={campo}>
                  <option value="">-</option>
                  <option value="Dra.">Dra.</option>
                  <option value="Dr.">Dr.</option>
                </select>
              </label>
              <label className={rotulo}>
                Como prefere ser chamada(o)
                <input value={d.nome_exibicao} onChange={mudar("nome_exibicao")} placeholder="Ana" className={campo} />
              </label>
            </div>
            <label className={rotulo}>
              Nome completo *
              <input value={d.nome_completo} onChange={mudar("nome_completo")} autoComplete="name" className={campo} />
            </label>
            <label className={rotulo}>
              WhatsApp com DDD *
              <input value={d.whatsapp} onChange={mudar("whatsapp")} inputMode="tel" autoComplete="tel" placeholder="(83) 99999-9999" className={campo} />
            </label>
            <label className={rotulo}>
              E-mail * (vai ser o seu login)
              <input value={d.email} onChange={mudar("email")} type="email" inputMode="email" autoComplete="email" className={campo} />
            </label>
            <label className={rotulo}>
              CPF ou CNPJ
              <input value={d.documento} onChange={mudar("documento")} inputMode="numeric" className={campo} />
            </label>
            <label className={rotulo}>
              Clínica
              <input value={d.clinica} onChange={mudar("clinica")} className={campo} />
            </label>
            <label className={rotulo}>
              Endereço
              <input value={d.endereco} onChange={mudar("endereco")} autoComplete="street-address" className={campo} />
            </label>
            <div className="grid grid-cols-[1fr_80px] gap-3">
              <label className={rotulo}>
                Cidade
                <input value={d.cidade} onChange={mudar("cidade")} autoComplete="address-level2" className={campo} />
              </label>
              <label className={rotulo}>
                UF
                <input value={d.uf} onChange={mudar("uf")} maxLength={2} autoComplete="address-level1" className={campo} />
              </label>
            </div>
            <div className="space-y-3 rounded-xl bg-neutral-50 p-3">
              <label className={rotulo}>
                Crie sua senha *
                <input value={senha} onChange={(e) => setSenha(e.target.value)} type="password" autoComplete="new-password" className={campo} />
              </label>
              <label className={rotulo}>
                Repita a senha *
                <input value={senha2} onChange={(e) => setSenha2(e.target.value)} type="password" autoComplete="new-password" className={campo} />
              </label>
              <p className="text-xs text-neutral-500">{REGRA_SENHA}</p>
            </div>
            {erro && <p className="text-sm text-rose-600">{erro}</p>}
            <button type="submit" disabled={enviando} className="w-full rounded-xl bg-brand-gradient px-4 py-3 text-base font-semibold text-white disabled:opacity-60">
              {enviando ? "Enviando..." : "Enviar cadastro"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
