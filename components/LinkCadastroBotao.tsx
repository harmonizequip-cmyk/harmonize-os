"use client";

// Link do formulário de cadastro para quem ainda não tem ficha (ou não se sabe
// qual é). Ao enviar, o sistema acha a ficha pelo WhatsApp e completa; sem
// ficha parecida, cria um lead. O aviso chega no celular.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSomenteLeitura } from "@/components/SomenteLeitura";

export default function LinkCadastroBotao({ className }: { className?: string }) {
  const supabase = createClient();
  const somenteLeitura = useSomenteLeitura();
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  if (somenteLeitura) return null;

  async function gerar() {
    setAviso(null);
    setOcupado(true);
    const { data, error } = await supabase.rpc("criar_convite_cadastro", { p_client_id: null });
    setOcupado(false);
    if (error || !data) return setAviso(error?.message ?? "Não consegui gerar o link.");
    const link = `${window.location.origin}/cadastro/${data as string}`;
    const texto = `Para liberar seu acesso ao Planejador HIPRO da Harmonize, preencha seu cadastro neste link (você mesma cria a senha):\n\n${link}\n\nAssim que você enviar, eu libero e te aviso.`;
    try {
      if (navigator.share) {
        await navigator.share({ text: texto });
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Link copiado. Cole na conversa dela.");
    } catch {
      window.prompt("Copie o link:", link);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button onClick={gerar} disabled={ocupado} className={className}>
        {ocupado ? "Gerando..." : "🔗 Link de cadastro"}
      </button>
      {aviso && <span className="mt-1 text-[11px] text-neutral-500">{aviso}</span>}
    </span>
  );
}
