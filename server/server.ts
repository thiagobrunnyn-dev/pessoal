// Servidor de produção: Node http + Next.js, com o mesmo envoltório por requisição que o worker do Sites fazia:
//  1) identidade: valida o cookie do Supabase Auth e injeta os headers `oai-authenticated-user-*` (descartando forjados);
//  2) escopo regional: runWithRegionalAccess(request, DB, ...) via AsyncLocalStorage compartilhado;
//  3) entrega ao Next.
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import next from 'next';
import {IdentityGateway} from './identity-gateway';
import {getRuntimeEnv, databasePath} from '../lib/runtime/env';
import {runWithRegionalAccess} from '../lib/regional-access';

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);

function required(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`[server] variável obrigatória ausente: ${name}`); process.exit(1); }
  return v;
}

async function main() {
  const supabaseUrl = required('SUPABASE_URL');
  if (!process.env.SITE_OWNER_ID) console.warn('[server] SITE_OWNER_ID não definido: nenhum usuário será reconhecido como proprietário.');
  const gateway = new IdentityGateway({supabaseUrl, jwtSecret: process.env.SUPABASE_JWT_SECRET || undefined});

  // Abre o banco (e aplica migrações pendentes) antes de aceitar tráfego.
  const env = getRuntimeEnv();
  if (!env.DB) throw new Error('Banco indisponível.');
  console.log(`[server] banco: ${databasePath()} · storage: ${process.env.STORAGE_BACKEND || 'local'}`);

  // request.url nos handlers é `${x-forwarded-proto}://${hostname}:${port}${path}`. Para que requireSameOrigin (CSRF)
  // e redirects absolutos usem o domínio público atrás do Caddy, informamos o domínio e a porta 443 (omitida pela URL).
  const publicHost = process.env.APP_DOMAIN;
  const app = publicHost ? next({dev, hostname: publicHost, port: 443}) : next({dev, hostname, port});
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await gateway.apply(req.headers);
      const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] || 'http';
      const host = req.headers.host || `${hostname}:${port}`;
      const request = new Request(`${proto}://${host}${req.url || '/'}`, {method: req.method, headers: toHeaders(req.headers)});
      const result: unknown = await runWithRegionalAccess(request, env.DB!, () => handle(req, res));
      // runWithRegionalAccess pode devolver uma Response própria (bloqueio de rota regional) sem chamar o Next.
      if (result instanceof Response && !res.headersSent) {
        res.statusCode = result.status;
        result.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(Buffer.from(await result.arrayBuffer()));
      }
    } catch (e) {
      console.error('[server] erro não tratado', e);
      if (!res.headersSent) { res.statusCode = 500; res.setHeader('Cache-Control', 'private, no-store'); res.end('Erro interno.'); }
    }
  });
  server.keepAliveTimeout = 65_000;
  server.listen(port, hostname, () => console.log(`[server] Mobiliza pronto em http://${hostname}:${port} (${dev ? 'dev' : 'produção'})`));

  const shutdown = (signal: string) => { console.log(`[server] ${signal}: encerrando`); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

function toHeaders(h: IncomingMessage['headers']): Headers {
  const out = new Headers();
  for (const [k, v] of Object.entries(h)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach(x => out.append(k, x)); else out.set(k, v);
  }
  return out;
}

main().catch(e => { console.error('[server] falha ao iniciar', e); process.exit(1); });
