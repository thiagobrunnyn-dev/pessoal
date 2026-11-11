import type {ReactNode} from 'react';
import {getOperator} from '../../lib/app-access';
import AppFrame from './app-frame';

/**
 * Layout shared by the internal routes: each route folder re-exports it as its layout.tsx.
 * A signed-in operator gets the dashboard frame around the screen. Anyone else gets the screen
 * as it is: the page still decides who may see it, and the public faces of some routes (the QR
 * pages for technicians and cleaning teams) stay simple.
 */
export default async function FrameLayout({children}: {children: ReactNode}) {
  const op = await getOperator().catch(() => null);
  return op ? <AppFrame op={op}>{children}</AppFrame> : children;
}
