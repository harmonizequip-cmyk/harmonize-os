/** @type {import('next').NextConfig} */
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
};

module.exports = nextConfig;
