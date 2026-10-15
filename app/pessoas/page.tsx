import {requireOperator} from '../../lib/app-access';
import PeopleDirectory from './people-directory';

export const dynamic = 'force-dynamic';

export default async function Page({searchParams}: {searchParams: Promise<Record<string, string | string[] | undefined>>}) {
  const query = await searchParams;
  const view = query.view === 'archived' ? 'archived' : query.view === 'trash' ? 'trash' : 'active';
  const operator = await requireOperator(view === 'active' ? '/pessoas' : '/pessoas?view=' + view);
  return <PeopleDirectory key={view} view={view} displayName={operator.actor.fullName || operator.actor.displayName} accessTitle={operator.title}/>;
}
