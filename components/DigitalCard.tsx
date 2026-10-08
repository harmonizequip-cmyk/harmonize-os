"use client";

import { useCallback, useEffect, useState } from "react";
import { Fingerprint } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { digitalSuportada, mensagemErroDigital } from "@/lib/digital";

interface Aparelho {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
}

function dataCurta(iso?: string): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "-";
}

/**
 * Entrar com a digital: cadastra a digital (ou o desbloqueio de tela) deste
 * celular e lista os aparelhos já cadastrados. Depois disso, a tela de
 * entrada tem o botão "Entrar com a digital", sem digitar e-mail e senha.
 */
export default function DigitalCard() {
  const supabase = createClient();
  const [suporte, setSuporte] = useState(true);
  const [aparelhos, setAparelhos] = useState<Aparelho[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.auth.passkey.list();
    if (error) {
      setAparelhos([]);
      setErro(mensagemErroDigital(error));
      return;
    }
    setAparelhos((data ?? []) as Aparelho[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSuporte(digitalSuportada());
    carregar();
  }, [carregar]);

  async function cadastrar() {
    setOcupado(true);
    setErro(null);
    setMensagem(null);
    const { error } = await supabase.auth.registerPasskey();
    setOcupado(false);
    if (error) {
      setErro(mensagemErroDigital(error));
      return;
    }
    setMensagem("Pronto. Na próxima vez, toque em \"Entrar com a digital\" na tela de entrada.");
    carregar();
  }

  async function apagar(a: Aparelho) {
    if (!window.confirm(`Tirar "${a.friendly_name ?? "este aparelho"}"? Ele volta a entrar só com senha.`)) return;
    setErro(null);
    setMensagem(null);
    const { error } = await supabase.auth.passkey.delete({ passkeyId: a.id });
    if (error) {
      setErro(mensagemErroDigital(error));
      return;
    }
    carregar();
  }

  const botao = "rounded-lg px-3 py-2 text-xs font-medium disabled:opacity-60";

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 text-brand-teal">
          <Fingerprint size={17} strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Entrar com a digital</p>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            Cadastre este celular uma vez. Depois, para entrar, é só a digital (ou o desbloqueio de tela), sem
            e-mail e senha. A digital não sai do celular. A senha continua valendo.
          </p>

          {!suporte ? (
            <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
              Este navegador não aceita digital. No celular, use o Chrome.
            </p>
          ) : (
            <div className="mt-3">
              <button type="button" onClick={cadastrar} disabled={ocupado} className={`${botao} bg-brand-teal text-white`}>
                {ocupado ? "Aguardando a digital..." : "Cadastrar a digital deste celular"}
              </button>
            </div>
          )}

          {aparelhos && aparelhos.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {aparelhos.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-neutral-700 dark:text-neutral-300">
                    {a.friendly_name ?? "Aparelho"} · desde {dataCurta(a.created_at)}
                    {a.last_used_at ? ` · último uso ${dataCurta(a.last_used_at)}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => apagar(a)}
                    className="shrink-0 text-neutral-500 underline underline-offset-2"
                  >
                    tirar
                  </button>
                </li>
              ))}
            </ul>
          )}

          {mensagem && <p className="mt-2 text-xs text-brand-teal">{mensagem}</p>}
          {erro && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{erro}</p>}
        </div>
      </div>
    </div>
  );
}
