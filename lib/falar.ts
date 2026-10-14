// Leitura em voz alta com a voz do próprio aparelho (speechSynthesis do
// navegador, grátis). No Android usa a voz do Google em português.
// Texto longo vai em pedaços de frase: o Chrome corta falas muito longas.

export function podeFalar(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Tira marcação (negrito, listas, links) para não ler símbolos em voz alta. */
export function textoParaFala(texto: string): string {
  return texto
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`#>|]/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/R\$\s?/g, "R$ ")
    .replace(/\n{2,}/g, ". ")
    .replace(/\n/g, ". ")
    .replace(/\.\s*\./g, ".")
    .trim();
}

function pedacos(texto: string): string[] {
  const frases = texto.match(/[^.!?]+[.!?]*/g) ?? [texto];
  const saida: string[] = [];
  let atual = "";
  for (const f of frases) {
    if ((atual + f).length > 220 && atual) {
      saida.push(atual.trim());
      atual = "";
    }
    atual += f;
  }
  if (atual.trim()) saida.push(atual.trim());
  return saida;
}

function vozPortugues(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices();
  const pt = vozes.filter((v) => v.lang?.toLowerCase().replace("_", "-").startsWith("pt-br"));
  return pt.find((v) => /google/i.test(v.name)) ?? pt[0] ?? null;
}

/** Fala o texto. Chama aoTerminar quando acabar (ou for interrompido). */
export function falar(texto: string, aoTerminar?: () => void): void {
  if (!podeFalar()) {
    aoTerminar?.();
    return;
  }
  const s = window.speechSynthesis;
  s.cancel();
  const partes = pedacos(textoParaFala(texto));
  if (partes.length === 0) {
    aoTerminar?.();
    return;
  }
  const voz = vozPortugues();
  partes.forEach((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = "pt-BR";
    if (voz) u.voice = voz;
    u.rate = 1.05;
    if (i === partes.length - 1) {
      u.onend = () => aoTerminar?.();
      u.onerror = () => aoTerminar?.();
    }
    s.speak(u);
  });
}

export function pararDeFalar(): void {
  if (podeFalar()) window.speechSynthesis.cancel();
}
