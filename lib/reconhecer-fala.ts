// Reconhecimento de fala do navegador (Chrome no Android usa o do Google,
// em português, e precisa de internet). Em navegador sem suporte,
// podeReconhecerFala() dá false e o microfone não aparece.

type Reconhecedor = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function construtor(): (new () => Reconhecedor) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function podeReconhecerFala(): boolean {
  return construtor() !== null;
}

const ERROS: Record<string, string> = {
  "not-allowed": "O microfone está bloqueado. Libere nas permissões do app.",
  "service-not-allowed": "O microfone está bloqueado. Libere nas permissões do app.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale de novo.",
  network: "Sem internet para entender a fala.",
  "audio-capture": "Não achei o microfone do aparelho.",
};

/**
 * Escuta uma frase. Chama aoOuvir com o texto parcial enquanto a pessoa
 * fala e aoTerminar com o texto final (ou vazio) e uma mensagem de erro.
 * Volta uma função que para de escutar.
 */
export function escutar(
  aoOuvir: (parcial: string) => void,
  aoTerminar: (final: string, erro: string | null) => void
): () => void {
  const C = construtor();
  if (!C) {
    aoTerminar("", "Este navegador não entende fala.");
    return () => {};
  }
  const r = new C();
  r.lang = "pt-BR";
  r.interimResults = true;
  r.continuous = false;
  r.maxAlternatives = 1;
  let texto = "";
  let erro: string | null = null;
  r.onresult = (e) => {
    texto = Array.from(e.results)
      .map((res) => res[0]?.transcript ?? "")
      .join(" ")
      .trim();
    aoOuvir(texto);
  };
  r.onerror = (e) => {
    if (e.error !== "aborted") erro = ERROS[e.error] ?? "Não consegui ouvir. Tente de novo.";
  };
  r.onend = () => aoTerminar(texto, texto ? null : erro);
  r.start();
  return () => r.stop();
}
