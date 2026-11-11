'use client';
import {Moon, Sun} from 'lucide-react';
import {hubThemeCookie, type HubTheme} from '../../lib/hub-theme';

/**
 * Switches the look of the whole system between dark and light.
 *
 * The current look lives on <html data-theme>, written by the server from the cookie, so this
 * button keeps no state: CSS shows the icon and label of the look it will switch to.
 * `floating` is for screens without the sidebar frame (login, public forms, QR pages).
 */
export default function ThemeToggle({floating = false}: {floating?: boolean}) {
  function toggle() {
    const page = document.documentElement;
    const next: HubTheme = page.dataset.theme === 'dark' ? 'light' : 'dark';
    page.dataset.theme = next;
    try {
      document.cookie = hubThemeCookie(next, window.location.protocol === 'https:');
    } catch {
      // The look still changes for this visit.
    }
  }
  return (
    <button type="button" className={floating ? 'theme-toggle theme-toggle-floating no-print' : 'theme-toggle'} onClick={toggle} aria-label="Alternar entre o visual claro e o escuro" title="Alternar entre o visual claro e o escuro">
      <Sun size={18} className="when-dark" aria-hidden="true"/>
      <Moon size={18} className="when-light" aria-hidden="true"/>
      <span className="theme-toggle-label"><span className="when-dark">Visual claro</span><span className="when-light">Visual escuro</span></span>
    </button>
  );
}
