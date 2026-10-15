import {publicRequestDirectory, REQUEST_DIRECTORY_HEADERS} from '../../../lib/request-directory';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    return Response.json(await publicRequestDirectory(), {headers: {...REQUEST_DIRECTORY_HEADERS, 'Access-Control-Allow-Origin': 'https://solicitacoes.example.invalid'}});
  } catch {
    return Response.json({error: 'Cadastros temporariamente indisponíveis.'}, {status: 503, headers: {...REQUEST_DIRECTORY_HEADERS, 'Access-Control-Allow-Origin': 'https://solicitacoes.example.invalid'}});
  }
}