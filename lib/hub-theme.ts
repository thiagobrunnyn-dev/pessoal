// Look of the overview dashboard. It is a per-browser preference kept in a cookie so the
// server can render the chosen look on the first paint; it carries no account data.
export type HubTheme = 'dark' | 'light';

export const HUB_THEME_COOKIE = 'mobiliza_hub_theme';

/** Dark is the default; only an exact `light` value switches it. */
export function hubThemeFromCookie(cookieHeader: string | null | undefined): HubTheme {
  return (cookieHeader || '').split(';').some(part => part.trim() === HUB_THEME_COOKIE + '=light') ? 'light' : 'dark';
}

/** Value for `document.cookie`. One year, this site only. */
export function hubThemeCookie(theme: HubTheme, secure: boolean): string {
  return HUB_THEME_COOKIE + '=' + theme + '; Path=/; Max-Age=31536000; SameSite=Lax' + (secure ? '; Secure' : '');
}
