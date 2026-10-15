import {AsyncLocalStorage} from 'node:async_hooks';
import type {Operator} from './app-access';
// Set only inside the authenticated gateway, never from visitor-supplied identity headers.
export type IntegrationGrant={id:string;ownerId:string;name:string;permission:'read'|'write'};
const context=new AsyncLocalStorage<IntegrationGrant>();
export const currentIntegration=()=>context.getStore();
export const withIntegration=<T>(grant:IntegrationGrant,run:()=>T)=>context.run(grant,run);
export function integrationGuard(id:string,ownerId:string,write=false){return {sql:"EXISTS(SELECT 1 FROM integration_keys WHERE id=? AND owner_id=? AND revoked_at IS NULL AND expires_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')"+(write?" AND permission='write'":"")+")",args:[id,ownerId]};}
export function integrationOperator(grant:IntegrationGrant):Operator{return {ownerId:grant.ownerId,role:'owner',title:'Integração n8n',revision:0,integrationId:grant.id,actor:{userId:'integration:'+grant.id,displayName:'n8n · '+grant.name,fullName:'n8n · '+grant.name,email:''}};}
