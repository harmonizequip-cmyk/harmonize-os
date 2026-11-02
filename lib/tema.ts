// Temas do app (escolha guardada só neste aparelho, localStorage harmonize-tema):
// - classico: o padrão de sempre;
// - aurora: brilho da marca no topo e barra flutuante (classe tema-aurora);
// - hipro: escuro azul-petróleo com luz turquesa, inspirado na capa do e-book
//   do HIPRO (classe tema-hipro), com o aparelho nas telas de destaque.
// O script do app/layout.tsx aplica a classe antes da tela aparecer (sem
// piscar), com a mesma regra de aplicarTema: no espaço Pessoal o HIPRO não é
// aplicado (o Pessoal fica sempre no violeta claro dele).

import { useEffect, useState } from "react";
import { ehEspacoPessoal } from "./espaco";

export type Tema = "classico" | "aurora" | "hipro";

export const CHAVE_TEMA = "harmonize-tema";
export const EVENTO_TEMA = "harmonize:tema";

export const TEMAS: { id: Tema; nome: string; dica: string }[] = [
  { id: "classico", nome: "Clássico", dica: "Claro, o de sempre" },
  { id: "aurora", nome: "Aurora", dica: "Brilho da marca e barra flutuante" },
  { id: "hipro", nome: "HIPRO", dica: "Escuro com luz turquesa e o aparelho" },
];

/** Cor da barra do navegador/celular em cada tema (meta theme-color). */
export const COR_BARRA: Record<Tema, string> = { classico: "#2e9a94", aurora: "#2e9a94", hipro: "#002431" };

export function nomeDoTema(t: Tema): string {
  return TEMAS.find((x) => x.id === t)?.nome ?? "Clássico";
}

export function ehTema(v: unknown): v is Tema {
  return v === "classico" || v === "aurora" || v === "hipro";
}

/** O tema escolhido neste aparelho (sem armazenamento: Clássico). */
export function lerTemaGuardado(): Tema {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return ehTema(v) ? v : "classico";
  } catch {
    return "classico";
  }
}

/** Põe as classes do tema no <html>. No Pessoal o HIPRO fica de fora. */
export function aplicarTema(t: Tema, pathname: string = typeof location !== "undefined" ? location.pathname : "/") {
  const html = document.documentElement;
  html.classList.toggle("tema-aurora", t === "aurora");
  html.classList.toggle("tema-hipro", t === "hipro" && !ehEspacoPessoal(pathname));
  const meta = document.querySelector('meta[name="theme-color"]');
  const efetivo: Tema = t === "hipro" && ehEspacoPessoal(pathname) ? "classico" : t;
  if (meta) meta.setAttribute("content", COR_BARRA[efetivo]);
}

/** Guarda a escolha, aplica e avisa os outros seletores abertos. */
export function escolherTema(t: Tema) {
  try {
    localStorage.setItem(CHAVE_TEMA, t);
  } catch {
    // sem armazenamento: vale até fechar o app
  }
  aplicarTema(t);
  window.dispatchEvent(new CustomEvent(EVENTO_TEMA, { detail: t }));
}

/** Tema escolhido (começa no Clássico até ler o aparelho, para não divergir do servidor). */
export function useTema(): [Tema, (t: Tema) => void] {
  const [tema, setTema] = useState<Tema>("classico");
  useEffect(() => {
    setTema(lerTemaGuardado());
    const ouvir = () => setTema(lerTemaGuardado());
    window.addEventListener(EVENTO_TEMA, ouvir);
    window.addEventListener("storage", ouvir);
    return () => {
      window.removeEventListener(EVENTO_TEMA, ouvir);
      window.removeEventListener("storage", ouvir);
    };
  }, []);
  return [
    tema,
    (t: Tema) => {
      setTema(t);
      escolherTema(t);
    },
  ];
}
