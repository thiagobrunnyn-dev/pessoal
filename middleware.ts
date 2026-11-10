import {NextResponse,type NextRequest} from 'next/server';
export function middleware(request:NextRequest){
  const response=NextResponse.next();
  const path=request.nextUrl.pathname;
  response.headers.set('Cache-Control','private, no-store, max-age=0');
  const mapEditor=path==='/mapa/editor';
  response.headers.set('Referrer-Policy',mapEditor?'strict-origin-when-cross-origin':'no-referrer');
  response.headers.set('X-Content-Type-Options','nosniff');
  // Browsers ignore HSTS over plain HTTP, so local development is unaffected.
  response.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  // Clickjacking: only this site may frame its own pages (the map editor is framed same-origin).
  response.headers.set('X-Frame-Options','SAMEORIGIN');
  // Pages only: file and photo API routes send their own stricter Content-Security-Policy.
  if(!path.startsWith('/api/'))response.headers.set('Content-Security-Policy',"frame-ancestors 'self'");
  return response;
}
export const config={matcher:['/','/entrar','/hoje','/acesso','/equipe','/pessoas','/hospedes','/gestao-a-vista','/cadastros','/prestadores','/servicos-laudos','/solicitacoes','/whatsapp','/canal/:path*','/formularios/:path*','/veiculos','/arquivados','/entregas','/ocupacao','/mobilizacoes','/ordens','/centrais','/equipamentos/:path*','/imoveis/:path*','/limpeza/:path*','/api/:path*','/configuracoes/:path*','/mapa/editor']};
