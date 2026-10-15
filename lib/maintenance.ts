import {scopedSelect,scopedReadArgs,isRegionalRequest} from './regional-access';
import { env } from 'cloudflare:workers';
export function db(){if(!env.DB)throw new Error('Banco temporariamente indisponível.');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('Fotos temporariamente indisponíveis.');return env.BUCKET;}
export const INTERVAL_DAYS=90;
export const ALERT_DAYS=5;
export function addDays(value:string,days:number){const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function validDate(s:string){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;}
export function clean(value:unknown,max=200){return String(value??'').trim().slice(0,max);}
function withoutInternalRowid(row:any){if(!row||!isRegionalRequest())return row;const {rowid,...safe}=row;return safe;}
export async function all(sql:string,...args:unknown[]){return (await db().prepare(scopedSelect(sql)).bind(...scopedReadArgs(args)).all()).results.map(withoutInternalRowid);}
export async function first(sql:string,...args:unknown[]){return withoutInternalRowid(await db().prepare(scopedSelect(sql)).bind(...scopedReadArgs(args)).first()) as any;}
export const noCache={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff'};
