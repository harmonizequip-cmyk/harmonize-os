// O aparelho HIPRO recortado da capa do e-book (public/hipro/aparelho-600.webp),
// com o brilho turquesa no chão. Só aparece no tema HIPRO (classe so-hipro em
// app/globals.css); nos outros temas fica escondido e nem é baixado (lazy).

export default function AparelhoHipro({ className = "" }: { className?: string }) {
  return (
    <img
      src="/hipro/aparelho-600.webp"
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      width={600}
      height={422}
      className={`so-hipro aparelho-hipro pointer-events-none select-none ${className}`}
    />
  );
}
