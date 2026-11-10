import {runWithRegionalAccess} from "../lib/regional-access";
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";
import { trustedIdentityRequest } from "../lib/trusted-identity";
import { resolveTeamSession } from "../lib/team-access";
import { resolveCloudflareOwner } from "../lib/cloudflare-owner-auth";
import { resolvePasswordSession } from "../lib/supabase-auth";

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>) {
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt) return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return { status: "request_context_expired", message: "This request has expired. Please try again." };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    if(!env.DB)return new Response('Serviço temporariamente indisponível.',{status:503});
    const standalone = env.MOBILIZA_AUTH_MODE === 'cloudflare-access';
    const passwordMode = env.MOBILIZA_SUPABASE_AUTH === '1';
    const sitesIdentity = !standalone && !passwordMode;
    const localMock = sitesIdentity && import.meta.env.DEV && import.meta.env.MOBILIZA_LOCAL_MOCK_AUTH === '1';
    request = trustedIdentityRequest(request, sitesIdentity ? env : {}, localMock);
    const team = passwordMode
      ? await resolvePasswordSession(request, env).catch(() => null)
      : await resolveTeamSession(request, env.DB);
    const actor = team ?? (standalone && !passwordMode ? await resolveCloudflareOwner(request, env) : null);
    if (actor || request.headers.has('x-mobiliza-team-session')) {
      const headers = new Headers(request.headers);
      headers.delete('x-mobiliza-team-session');
      if (actor) {
        for (const name of [...headers.keys()]) {
          if (name.startsWith('oai-authenticated-user-')) headers.delete(name);
        }
        headers.set('oai-authenticated-user-id', actor.userId);
        headers.set('oai-authenticated-user-email', actor.email);
        if (actor.fullName) {
          headers.set('oai-authenticated-user-full-name', encodeURIComponent(actor.fullName));
          headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
        }
        if (team) headers.set('x-mobiliza-team-session', '1');
      }
      request = new Request(request, { headers });
    }
    return runWithRegionalAccess(request, env.DB, () => runWithConnectorBinding(binding, () => handler.fetch(request, env, ctx)));
  },
};
