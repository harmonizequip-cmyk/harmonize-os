/** @type {import('next').NextConfig} */

// Cabeçalhos de segurança em todas as respostas (checklist de segurança,
// pontos 15 e 16). A CSP só deixa a página falar com o próprio site e com o
// Supabase: mesmo que algum dia entrasse um script estranho, ele não teria
// para onde mandar os dados. 'unsafe-inline' fica porque o Next.js e o
// script de tema usam scripts embutidos; 'wasm-unsafe-eval' é do gerador de
// PDF do contrato.
const supabase = "https://*.supabase.co";
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  "font-src 'self' data:",
  `connect-src 'self' data: blob: ${supabase} wss://*.supabase.co`,
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob: data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const cabecalhos = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microfone só para o próprio app (Nova tarefa e Despesa por voz).
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=(), usb=(), microphone=(self)" },
];

// Ferramentas em HTML próprio (public/ferramentas, ex.: planejador HIPRO)
// abrem dentro de uma tela do app: podem ser emolduradas pelo próprio site e
// usam as fontes do Google que vieram no arquivo original.
const cspFerramentas = csp
  .replace("frame-ancestors 'none'", "frame-ancestors 'self'")
  .replace("style-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com")
  .replace("font-src 'self' data:", "font-src 'self' data: https://fonts.gstatic.com");
const cabecalhosFerramentas = cabecalhos.map((c) =>
  c.key === "Content-Security-Policy"
    ? { key: c.key, value: cspFerramentas }
    : c.key === "X-Frame-Options"
    ? { key: c.key, value: "SAMEORIGIN" }
    : c
);

const nextConfig = {
  // Sem isto, o Next.js App Router reaproveita (client-side) o RSC já buscado
  // para o layout/página ao navegar entre rotas irmãs (Link), mesmo em rotas
  // dinâmicas. Isso pode fazer BottomNav (renderizado no layout, com
  // permissions/isAdmin vindos do servidor) continuar mostrando os dados da
  // primeira navegação da sessão em vez de recalcular a cada rota.
  // dynamic: 0 desliga esse cache para navegações client-side em rotas dinâmicas.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!ferramentas/).*)", headers: cabecalhos },
      { source: "/ferramentas/:path*", headers: cabecalhosFerramentas },
    ];
  },
};

module.exports = nextConfig;
