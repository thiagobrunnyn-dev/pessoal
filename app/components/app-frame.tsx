import type {ReactNode} from 'react';
import {canAdminister, type Operator} from '../../lib/app-access';
import {isRegionalRequest} from '../../lib/regional-access';
import AppShell from './app-shell';

/** Server side of the shared frame: reads what the sidebar and header need from the operator. */
export default function AppFrame({op, children}: {op: Operator; children: ReactNode}) {
  return (
    <AppShell
      displayName={op.actor.fullName || op.actor.displayName}
      accessTitle={op.title}
      canManageAccess={canAdminister(op)}
      passwordSession={!!op.actor.passwordSession}
      regional={isRegionalRequest()}
    >
      {children}
    </AppShell>
  );
}
