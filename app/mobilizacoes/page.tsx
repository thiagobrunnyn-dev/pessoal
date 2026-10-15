import type {ComponentProps} from 'react';
import {requireOperator} from '../../lib/app-access';
import {mobilizationApi} from '../../lib/mobilization-runtime';
import Mobilizations from '../mobilizations';
export const dynamic='force-dynamic';
export const metadata={title:'Mobilizações · MBL'};
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const query=await searchParams,op=await requireOperator('/mobilizacoes');
 // Run the same authenticated read in the server context; this performs no network request.
 let initialData:ComponentProps<typeof Mobilizations>['initialData']=null;
 try{const response=await mobilizationApi.GET(new Request('https://mobiliza.example.invalid/api/mobilizations'));if(response.ok)initialData=await response.json() as ComponentProps<typeof Mobilizations>['initialData'];}catch{}
 return <Mobilizations displayName={op.actor.fullName||op.actor.displayName} accessTitle={op.title} initialNew={query.new==='1'&&typeof query.id!=='string'} initialId={typeof query.id==='string'?query.id:undefined} initialData={initialData}/>;
}
