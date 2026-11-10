// Which sites may show the panel inside a frame.
//
// By default only the panel itself may (the map editor is framed same-origin). A deployment can
// trust more origins, such as the hosting editor's embedded preview, by listing them in
// MOBILIZA_FRAME_ANCESTORS separated by spaces or commas. Anything that is not a plain
// https origin is ignored, so a typo narrows the policy instead of widening it.

// https://host or https://*.host, with an optional port. No path, query, scheme-only or bare "*".
const TRUSTED_ORIGIN = /^https:\/\/(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?$/;
const MAX_TRUSTED_ORIGINS = 8;

export function trustedFrameOrigins(configured: string | null | undefined): string[] {
  if (!configured) return [];
  const origins = configured.toLowerCase().split(/[\s,]+/).filter(entry => TRUSTED_ORIGIN.test(entry));
  return [...new Set(origins)].slice(0, MAX_TRUSTED_ORIGINS);
}

export type FramePolicy = {
  /** Content-Security-Policy value for pages. */
  contentSecurityPolicy: string;
  /** True when no other origin is trusted, so X-Frame-Options: SAMEORIGIN can be sent as well. */
  sameOriginOnly: boolean;
};

export function framePolicy(configured: string | null | undefined): FramePolicy {
  const origins = trustedFrameOrigins(configured);
  return {
    contentSecurityPolicy: ["frame-ancestors 'self'", ...origins].join(' '),
    sameOriginOnly: origins.length === 0,
  };
}
