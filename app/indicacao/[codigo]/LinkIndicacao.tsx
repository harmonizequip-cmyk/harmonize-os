"use client";

// Link de indicação de uma cliente (/indicacao/<codigo>, sem login). Pede à
// Edge Function "cadastro-cliente" um formulário de 7 dias amarrado a quem
// indicou e leva para /cadastro/<token>, que mostra o presente e a contagem.
// O formulário fica guardado neste aparelho: voltar ao link reabre o mesmo
// (e a contagem continua de onde estava).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const URL_FUNCAO = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cadastro-cliente`;
const CABECALHOS = { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" };
const chave = (codigo: string) => `harmonize-indicacao-${codigo}`;

export default function LinkIndicacao({ codigo }: { codigo: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let guardado: string | null = null;
    try {
      guardado = localStorage.getItem(chave(codigo));
    } catch {
      // sem armazenamento: cria um novo
    }
    if (guardado && /^[0-9a-f]{64}$/.test(guardado)) {
      router.replace(`/cadastro/${guardado}`);
      return;
    }
    fetch(URL_FUNCAO, { method: "POST", headers: CABECALHOS, body: JSON.stringify({ acao: "indicacao", codigo }) })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok || !j?.token) {
          setErro(j?.erro ?? "Este link de indicação não vale mais. Fale com quem te indicou.");
          return;
        }
        try {
          localStorage.setItem(chave(codigo), j.token);
        } catch {
          // segue sem guardar
        }
        router.replace(`/cadastro/${j.token}`);
      })
      .catch(() => setErro("Não consegui abrir. Confira a internet e tente de novo."));
  }, [codigo, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/harmonize-logo-full.png" alt="Harmonize" className="mx-auto mb-6 h-10 w-auto" />
        {erro ? (
          <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-sm text-neutral-700">{erro}</p>
        ) : (
          <p className="text-sm text-neutral-500">Abrindo o seu presente...</p>
        )}
      </div>
    </div>
  );
}
