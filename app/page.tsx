import {managementSignInPath, getChatGPTUser} from './chatgpt-auth';
import {isRegionalRequest} from '../lib/regional-access';
import {canAdminister, requireOperator} from '../lib/app-access';
import {filtersFromSearchRecord} from '../lib/operation-filter-values';
import {hubData} from '../lib/hub-data';
import {headers} from 'next/headers';
import {hubThemeFromCookie} from '../lib/hub-theme';
import Hub from './hub';
import PublicHome from './public-home';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const user = await getChatGPTUser();
  return user
    ? {title: 'Visão Geral da Operação'}
    : {
        title: {absolute: 'Mobiliza Facilities | Gestão e solicitações'},
        description: 'Conheça o Mobiliza Facilities, envie solicitações de manutenção ou compra e acesse o painel da equipe.',
      };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!await getChatGPTUser()) {
    return <PublicHome signInHref={managementSignInPath('/')}/>;
  }

  const initialQuery = filtersFromSearchRecord(await searchParams || {});
  const op = await requireOperator('/' + (initialQuery ? '?' + initialQuery : ''));
  const summary = await hubData(op.ownerId, new URLSearchParams(initialQuery)).catch(() => null);
  // The dashboard look is a per-browser preference; dark is the default.
  const initialTheme = hubThemeFromCookie((await headers()).get('cookie'));
  return (
    <Hub
      regional={isRegionalRequest()}
      initialQuery={initialQuery}
      initialSummary={summary}
      initialTheme={initialTheme}
      displayName={op.actor.fullName || op.actor.displayName}
      accessTitle={op.title}
      canManageAccess={canAdminister(op)}
      passwordSession={op.actor.passwordSession}
    />
  );
}
