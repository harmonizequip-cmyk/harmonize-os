"use client";

// "Liberar na Contourline Academy": quem cadastra a cliente lá é o dono, então
// o link da Academy só aparece nas telas dele, nunca vai para a cliente.
// O botão abre a página de convite já com nome e e-mail no endereço
// (linkAcademyPreenchido); se a Academy ignorar os campos, abre vazia e os
// botões de copiar resolvem.

import { useState } from "react";
import { linkAcademyPreenchido } from "@/lib/cadastro-formulario";

export function CopiarBotao({ rotulo, texto }: { rotulo: string; texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 2000);
        } catch {
          // sem permissão de copiar
        }
      }}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700"
    >
      {ok ? "Copiado ✓" : rotulo}
    </button>
  );
}

export default function LiberarAcademy({
  nome,
  email,
  className = "",
}: {
  nome: string | null;
  email: string | null;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-emerald-200 bg-white p-3 ${className}`}>
      <p className="mb-2 text-xs font-medium text-neutral-600">Liberar na Contourline Academy</p>
      <div className="flex flex-wrap gap-2">
        <a
          href={linkAcademyPreenchido(nome, email)}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
        >
          Abrir cadastro da Academy
        </a>
        {nome && <CopiarBotao rotulo="Copiar nome" texto={nome} />}
        {email && <CopiarBotao rotulo="Copiar e-mail" texto={email} />}
      </div>
    </div>
  );
}
