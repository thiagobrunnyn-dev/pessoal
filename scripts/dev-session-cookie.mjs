// Ferramenta de DESENVOLVIMENTO: gera um cookie de sessão Supabase assinado com SUPABASE_JWT_SECRET (HS256)
// para testar o app localmente sem um projeto Supabase real. Nunca use em produção.
// Uso: SUPABASE_JWT_SECRET=... SUPABASE_URL=... node scripts/dev-session-cookie.mjs <uuid> <email> [expired]
import {SignJWT} from 'jose';

const [sub, email, flag] = process.argv.slice(2);
if (!sub || !email) { console.error('uso: node scripts/dev-session-cookie.mjs <uuid> <email> [expired]'); process.exit(1); }
const secretRaw = process.env.SUPABASE_JWT_SECRET, url = process.env.SUPABASE_URL;
if (!secretRaw || !url) { console.error('defina SUPABASE_JWT_SECRET e SUPABASE_URL'); process.exit(1); }
const ref = new URL(url).hostname.split('.')[0];
const now = Math.floor(Date.now() / 1000), exp = flag === 'expired' ? now - 600 : now + 3600;
const jwt = await new SignJWT({email, aud: 'authenticated', role: 'authenticated', user_metadata: {full_name: 'Usuário de Teste'}})
  .setProtectedHeader({alg: 'HS256'}).setIssuer(url.replace(/\/+$/, '') + '/auth/v1').setSubject(sub).setIssuedAt(now).setExpirationTime(exp)
  .sign(new TextEncoder().encode(secretRaw));
const value = 'base64-' + Buffer.from(JSON.stringify({access_token: jwt, refresh_token: 'dev', expires_at: exp, token_type: 'bearer'})).toString('base64url');
// Reproduz a fragmentação do @supabase/ssr em dois cookies.
const half = Math.ceil(value.length / 2);
console.log(`sb-${ref}-auth-token.0=${value.slice(0, half)}; sb-${ref}-auth-token.1=${value.slice(half)}`);
