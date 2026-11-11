'use client';
import type {ReactNode} from 'react';
import AdminMenu from './admin-menu';
import HubNavigation from './hub-navigation';
import PasswordSignOut from './password-sign-out';
import ThemeToggle from './theme-toggle';
import '../hub.css';
import '../hub-theme.css';

/**
 * Frame shared by the internal screens: the dashboard sidebar and header around the screen.
 * The screen keeps its own markup; app/theme.css turns its old top bar into a slim title strip.
 * Routes use it through <AppFrame op={...}>, which fills these props from the signed-in operator.
 */
export default function AppShell({displayName, accessTitle, canManageAccess, passwordSession, regional, children}: {
  displayName: string;
  accessTitle: string;
  canManageAccess: boolean;
  passwordSession: boolean;
  regional: boolean;
  children: ReactNode;
}) {
  return (
    <div className="hub-workspace app-workspace">
      <header className="hub-compact-header no-print">
        <HubNavigation displayName={displayName} accessTitle={accessTitle} regional={regional}/>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Plain links on purpose: every screen is a full server render behind the access checks. */}
        <a className="hub-mobile-brand" href="/" aria-label="MOBILIZA GESTÃO, visão geral"><img src="/icons/symbol-192-v54.png" width={36} height={36} alt=""/><span>MOBILIZA GESTÃO</span></a>
        <div className="hub-header-options">
          <span className="hub-header-label">Mobiliza Facilities</span>
          {passwordSession && <PasswordSignOut/>}
          <ThemeToggle/>
          <AdminMenu compact canManageAccess={canManageAccess} canManageCatalog={!regional}/>
        </div>
      </header>
      <div className="app-content">{children}</div>
    </div>
  );
}
