import {env} from 'cloudflare:workers';
import {db} from '../../../lib/maintenance';
import {SITE_OWNER_ID} from '../../../lib/owner-access';
import {createRequestAgent} from '../../../lib/request-agent';
import {requestNotices} from '../../../lib/request-notices-runtime';

export const dynamic = 'force-dynamic';

const api = createRequestAgent({
  db,
  config: () => ({
    ownerId: SITE_OWNER_ID,
    token: env.MOBILIZA_WHATSAPP_REQUEST_TOKEN,
    identityKey: env.MOBILIZA_WHATSAPP_REQUEST_IDENTITY_KEY,
    session: env.MOBILIZA_WHATSAPP_REQUEST_SESSION,
  }),
  notify: requestNotices.queueDirectReceipt,
});

export const GET = api.GET;
export const POST = api.POST;
