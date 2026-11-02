"use client";

// Campo de senha com o olho para mostrar ou esconder o que foi digitado.
// Recebe as mesmas propriedades de um <input>; o botão fica dentro do campo,
// à direita (o campo ganha espaço à direita para o texto não passar por baixo).

import { useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

export default function CampoSenha({ className = "", ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [ver, setVer] = useState(false);
  return (
    <span className="relative block">
      <input {...props} type={ver ? "text" : "password"} className={`${className} pr-12`} />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Esconder senha" : "Mostrar senha"}
        aria-pressed={ver}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-neutral-400 active:text-neutral-600"
      >
        {ver ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}
