import {publicRequestDirectoryPhoto, REQUEST_DIRECTORY_HEADERS} from '../../../../../lib/request-directory';

export const dynamic = 'force-dynamic';
export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  try {
    return await publicRequestDirectoryPhoto((await params).id);
  } catch {
    return new Response('Foto temporariamente indisponível.', {status: 503, headers: REQUEST_DIRECTORY_HEADERS});
  }
}