/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Mantém os dados sempre frescos na navegação interna; nunca pré-carrega registros privados.
    // (static exige >= 30; o original usava 0, que o Next rejeitava e ignorava.)
    staleTimes: {dynamic: 0, static: 30},
  },
  // Módulos de runtime que usam `node:sqlite` ficam fora do bundle do Next (resolvidos pelo Node em produção).
  serverExternalPackages: ['jose'],
  poweredByHeader: false,
};

export default nextConfig;
