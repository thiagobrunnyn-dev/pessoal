/**
 * Synthetic, local-only security and transport API contract tests.
 * Run: node --test tests/transport.test.mjs
 * No production storage, accounts, memberships, or network calls are used.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
const OWNER_SUBJECT='synthetic-owner-subject';

const HOST='https://pilot.test';
const OWNER_EMAIL='synthetic-owner@example.test';
const A={subject:'synthetic-driver-a',id:'driver-a',name:'Synthetic Driver A'};
const B={subject:'synthetic-driver-b',id:'driver-b',name:'Synthetic Driver B'};
const DEMO={subject:'synthetic-demo-driver',id:'driver-demo',name:'Synthetic Demo Driver'};
const DISABLED={subject:'synthetic-disabled-driver',id:'driver-disabled',name:'Synthetic Disabled Driver'};

function fixture(t,{members=true}={}){
 const sql=new DatabaseSync(':memory:');
 for(const migration of ['0000_skinny_midnight.sql','0001_flat_vulture.sql','0002_charming_skin.sql','0003_productive_human_cannonball.sql'])sql.exec(fs.readFileSync(new URL('../drizzle/'+migration,import.meta.url),'utf8'));
 t.after(()=>sql.close());
 class Statement{
  constructor(query,args=[]){this.query=query;this.args=args}
  bind(...args){return new Statement(this.query,args)}
  async first(column){const row=sql.prepare(this.query).get(...this.args)||null;return column?row?.[column]??null:row}
  async all(){return this.execute()}
  async run(){return this.execute()}
  execute(){const stmt=sql.prepare(this.query);if(stmt.columns().length)return {results:stmt.all(...this.args),success:true,meta:{changes:0}};const result=stmt.run(...this.args);return {results:[],success:true,meta:{changes:Number(result.changes)}}}
 }
 let nextBatchHook;
 const beforeNextBatch=hook=>{nextBatchHook=hook};
 const DB={prepare:query=>new Statement(query),async batch(statements){if(nextBatchHook){const hook=nextBatchHook;nextBatchHook=null;hook()}sql.exec('BEGIN');try{const results=statements.map(stmt=>stmt.execute());sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}}};
 function member(driver,mode='live',tenant=OWNER_SUBJECT,enabled=1){sql.prepare('INSERT INTO transport_memberships(subject,tenant,mode,driver_id,display_name,enabled) VALUES(?,?,?,?,?,?)').run(driver.subject,tenant,mode,driver.id,driver.name,enabled)}
 if(members){member(A);member(B);member(DEMO,'demo');member(DISABLED,'live',OWNER_SUBJECT,0);member({subject:'synthetic-foreign-member',id:'foreign-driver',name:'Foreign Driver'},'live','synthetic-other-tenant')}
 async function req(path,{method='GET',body,raw,subject=OWNER_SUBJECT,email=OWNER_EMAIL,mode='live',origin=HOST,contentType='application/json',db=DB,headers={}}={}){
  const url=new URL(path,HOST);if(mode!==null)url.searchParams.set('mode',mode);
  const h={...headers};if(subject!==null)h['oai-authenticated-user-id']=subject;if(email!==null)h['oai-authenticated-user-email']=email;if(origin!==null)h.origin=origin;if(contentType!==null)h['content-type']=contentType;
  const response=await worker.fetch(new Request(url,{method,headers:h,body:raw??(body===undefined?undefined:JSON.stringify(body))}),{DB:db,OWNER_SUBJECT});
  const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=null}
  return {status:response.status,data,text,headers:response.headers};
 }
 const payload=(overrides={})=>({requestId:crypto.randomUUID(),route:'Canaã dos Carajás',leg:'inbound',origin:'Synthetic Canaã pickup',destination:'Lavanderia',driverId:A.id,lotIds:[],...overrides});
 const create=(overrides={},options={})=>req('/api/trips',{...options,method:'POST',body:payload(overrides)});
 async function trip(overrides={},options={}){const result=await create(overrides,options);assert.equal(result.status,200,`create trip: ${result.text}`);assert.ok(result.data?.trip?.id,'create returns a trip id');return result.data.trip}
 const event=(tripId,kind='depart',options={},overrides={})=>req('/api/driver/event',{subject:A.subject,...options,method:'POST',body:{requestId:crypto.randomUUID(),tripId,event:kind,revision:sql.prepare('SELECT revision FROM transport_trips WHERE id=?').get(tripId)?.revision??0,...overrides}});
 const assign=(tripId,driverId=A.id,options={},overrides={})=>req('/api/trips/assign',{...options,method:'POST',body:{requestId:crypto.randomUUID(),tripId,driverId,...overrides}});
 const stored=id=>sql.prepare('SELECT * FROM transport_trips WHERE id=?').get(id);
 const events=id=>sql.prepare('SELECT * FROM transport_events WHERE trip_id=? ORDER BY created_at,id').all(id);
 return {sql,DB,member,req,payload,create,trip,event,assign,stored,events,beforeNextBatch};
}
function status(result,expected,label='request'){assert.equal(result.status,expected,`${label}: ${result.text}`)}

async function setup(t){const f=fixture(t);const state=async(mode='live')=>(await f.req('/api/state',{mode})).data;const action=async(input,opts={})=>f.req('/api/action',{...opts,method:'POST',body:{...input,version:(await state(opts.mode)).version,requestId:crypto.randomUUID()}});const create=async input=>{const r=await action(input);status(r,200);return r.data.result.id};const companyId=await create({type:'company',name:'Synthetic company'}),destinationId=await create({type:'destination',companyId,city:'Canaã dos Carajás',lodging:'Synthetic lodging',block:'A',room:'1'}),owner=await create({type:'person',companyId,destinationId,name:'Synthetic person',mat:'001'}),pieceId=await create({type:'piece',owner,pieceType:'Camisa'}),rolId=await create({type:'rol',owner,date:'2026-10-03',triageDate:'2026-10-03',collectionTime:'07:00',shirts:1,pants:0,notes:'Initial note'});
 const payload=async(kind,id,changes,extra={})=>({type:'correct',kind,id,changes,reason:'Synthetic clerical correction',version:(await state()).version,requestId:crypto.randomUUID(),...extra});
 const edit=async(kind,id,changes,extra={},opts={})=>f.req('/api/action',{...opts,method:'POST',body:await payload(kind,id,changes,extra)});
 const tripEdit=(trip,changes,extra={},opts={})=>f.req('/api/trips/correct',{...opts,method:'POST',body:{tripId:trip.id,revision:trip.revision,changes,reason:'Synthetic trip correction',requestId:crypto.randomUUID(),...extra}});
 const journal=()=>f.sql.prepare('SELECT * FROM record_corrections ORDER BY created_at,id').all();
 return {...f,state,action,create,companyId,destinationId,owner,pieceId,rolId,payload,edit,tripEdit,journal};
}

test('all registry kinds and rol are editable with durable complete journal and stable IDs',async t=>{
 const f=await setup(t);const before=(await f.state()).state;const rows=[['companies',f.companyId,{name:'Corrected company'}],['destinations',f.destinationId,{lodging:'Corrected lodge',room:'2',block:'B'}],['people',f.owner,{name:'Corrected person',mat:'002'}],['pieces',f.pieceId,{type:'Calça'}],['rols',f.rolId,{notes:'Corrected note',shirts:0,pants:1,snapshot:{name:'Corrected historical name'}}]];
 for(const [kind,id,changes]of rows){status(await f.edit(kind,id,changes),200);const entry=f.journal().find(x=>x.entity_kind===kind);assert.equal(entry.actor,OWNER_SUBJECT);assert.ok(entry.created_at);assert.equal(entry.reason,'Synthetic clerical correction');const b=JSON.parse(entry.before_json),a=JSON.parse(entry.after_json);assert.equal(b[0].id,id);assert.equal(a[0].id,id);assert.deepEqual(b[0].data,before[kind].find(x=>x.id===id));assert.notDeepEqual(a,b)}
 const after=(await f.state()).state;for(const kind of Object.keys(before))assert.deepEqual(after[kind].map(x=>x.id),before[kind].map(x=>x.id));assert.equal(after.rols[0].snapshot.company,'Synthetic company');assert.equal(after.rols[0].snapshot.lodging,'Synthetic lodging');assert.deepEqual(after.rols[0].events,before.rols[0].events);assert.equal(f.journal().length,5);
 const backup=await f.req('/api/export');assert.equal(backup.data.corrections.length,5);assert.equal((await f.req('/api/corrections')).data.corrections.length,5);
});

test('reason, identifiers, counts, dates, duplicate names and unknown fields fail without writes',async t=>{
 const f=await setup(t),base=(await f.state()).version;
 for(const [kind,id,changes,extra]of [['companies',f.companyId,{name:'Good'},{reason:''}],['companies',f.companyId,{id:'NEW'},{}],['pieces',f.pieceId,{type:'Other'},{}],['rols',f.rolId,{shirts:-1},{}],['rols',f.rolId,{date:'2026-02-30'},{}],['rols',f.rolId,{date:'2026-10-04'},{}],['rols',f.rolId,{triageDate:'2026-10-02'},{}],['rols',f.rolId,{collectionTime:'09:01'},{}],['rols',f.rolId,{dispatched:false},{}],['rols',f.rolId,{triageDate:''},{}],['rols',f.rolId,{snapshot:{companyId:'bad'}},{}]])status(await f.edit(kind,id,changes,extra),400);
 assert.equal((await f.state()).version,base);assert.equal(f.journal().length,0);
});

test('edits cannot change permanent QR or active piece identity/type, shrink received or reopen dispatch',async t=>{
 const f=await setup(t);status(await f.action({type:'entry',rolId:f.rolId,code:f.pieceId}),200);
 status(await f.edit('pieces',f.pieceId,{type:'Calça'}),400);status(await f.edit('pieces',f.pieceId,{id:'NEW-ID'}),400);status(await f.edit('rols',f.rolId,{shirts:0,pants:1}),400);status(await f.edit('rols',f.rolId,{date:'2099-10-03',triageDate:'2099-10-03'}),400);
 for(const type of ['wash','ready'])status(await f.action({type,rolId:f.rolId}),200);status(await f.action({type:'exit',rolId:f.rolId,code:f.pieceId}),200);status(await f.action({type:'dispatch',rolId:f.rolId}),200);
 const original=(await f.state()).state.rols[0];status(await f.edit('rols',f.rolId,{shirts:2}),400);status(await f.edit('rols',f.rolId,{notes:'Historical clerical note'}),200);const after=(await f.state()).state.rols[0];assert.deepEqual(after.records,original.records);assert.deepEqual(after.events,original.events);assert.equal(after.dispatchedAt,original.dispatchedAt);assert.equal(after.dispatched,true);
 status(await f.edit('pieces',f.pieceId,{type:'Calça'}),200);assert.equal((await f.state()).state.rols[0].records[0].pieceType,'Camisa');
});

test('legacy piece types are frozen before correction and audit includes every affected rol',async t=>{
 const f=await setup(t);const state=(await f.state()).state,r=state.rols[0];r.records=[{id:f.pieceId,status:'dispatched',checked:true,receivedAt:'2026-10-03T12:00:00Z'}];r.dispatched=true;f.sql.prepare("UPDATE uniform_records SET body=? WHERE kind='rols' AND id=?").run(JSON.stringify(r),r.id);
 status(await f.edit('pieces',f.pieceId,{type:'Calça'}),200);const row=f.journal()[0];assert.equal(JSON.parse(row.before_json).length,2);assert.equal(JSON.parse(row.before_json).find(x=>x.kind==='rols').data.records[0].pieceType,undefined);assert.equal((await f.state()).state.rols[0].records[0].pieceType,'Camisa');
});

test('exact replay and same-key races are idempotent; conflicting key/payload and stale writes cannot overwrite',async t=>{
 const f=await setup(t);let payload=await f.payload('companies',f.companyId,{name:'One correction'});
 const r=await Promise.all([f.req('/api/action',{method:'POST',body:payload}),f.req('/api/action',{method:'POST',body:payload})]);for(const x of r)status(x,200);assert.equal(f.journal().length,1);
 status(await f.req('/api/action',{method:'POST',body:{...payload,changes:{name:'Conflicting replay'}}}),409);assert.equal((await f.state()).state.companies[0].name,'One correction');
 payload=await f.payload('companies',f.companyId,{name:'First racing correction'});const race=await Promise.all([f.req('/api/action',{method:'POST',body:payload}),f.req('/api/action',{method:'POST',body:{...payload,changes:{name:'Second racing correction'}}})]);assert.deepEqual(race.map(x=>x.status).sort(),[200,409]);assert.equal(f.journal().length,2);assert.equal((await f.state()).state.companies[0].name,race.find(x=>x.status===200).data.state.companies[0].name);
 status(await f.edit('companies',f.companyId,{name:'Stale'},{version:payload.version}),409);
});

test('permissions and live/demo isolation cover corrections, audit, and transport correction routes',async t=>{
 const f=await setup(t),trip=await f.trip();for(const subject of [A.subject,B.subject,'unknown']){status(await f.edit('companies',f.companyId,{name:'Forbidden'},{},{subject}),403);status(await f.tripEdit(trip,{origin:'Forbidden'},{},{subject}),403);status(await f.req('/api/corrections',{subject}),403)}
 status(await f.edit('companies',f.companyId,{name:'Cross mode'},{},{mode:'demo'}),409);assert.equal(f.journal().length,0);status(await f.edit('companies',f.companyId,{name:'Origin'},{},{origin:'https://evil.test'}),403);
});

test('travel edits preserve originals, append many audits, handle replay/conflict and forbid invented or removed movements',async t=>{
 const f=await setup(t);let trip=await f.trip({lotIds:[f.rolId]});const created=f.stored(trip.id);const requestId=crypto.randomUUID();let result=await f.tripEdit(trip,{origin:'Corrected pickup'},{requestId});status(result,200);assert.equal(result.data.trip.revision,1);
 const replay=await f.tripEdit(trip,{origin:'Corrected pickup'},{requestId});status(replay,200);assert.equal(replay.data.replayed,true);status(await f.tripEdit(trip,{origin:'Conflicting'},{requestId}),409);status(await f.tripEdit(trip,{origin:'Stale'}),409);
 trip=result.data.trip;status(await f.tripEdit(trip,{departedAt:new Date().toISOString()}),400);status(await f.tripEdit(trip,{arrivedAt:new Date().toISOString()}),400);
 for(let i=0;i<35;i++){result=await f.tripEdit(trip,{origin:'Corrected '+i});status(result,200);trip=result.data.trip}
 assert.equal(f.journal().length,36);assert.equal(f.stored(trip.id).created_at,created.created_at);assert.equal(f.events(trip.id).length,0);assert.equal((await f.req('/api/corrections')).data.corrections.length,36);
});

test('trip date corrections keep movement evidence and reject reverse chronology, future, clearing and changed driver',async t=>{
 const f=await setup(t);const trip=await f.trip();f.sql.prepare('UPDATE transport_trips SET created_at=?,departed_at=?,arrived_at=?,revision=2 WHERE id=?').run('2026-10-03T10:00:00.000Z','2026-10-03T11:00:00.000Z','2026-10-03T12:00:00.000Z',trip.id);f.sql.prepare('INSERT INTO transport_events(id,tenant,mode,trip_id,request_id,kind,actor,created_at) VALUES(?,?,?,?,?,?,?,?)').run('event-original',OWNER_SUBJECT,'live',trip.id,crypto.randomUUID(),'depart',A.subject,'2026-10-03T11:00:00.000Z');const originalEvents=f.events(trip.id);const current=(await f.req('/api/trips')).data.trips[0];
 for(const changes of [{departedAt:null},{arrivedAt:''},{departedAt:'2026-10-03T13:00:00Z'},{departedAt:'2026-10-03T09:00:00Z'},{arrivedAt:'2099-10-03T12:00:00Z'},{arrivedAt:'2026-02-30T12:00:00Z'},{driverId:B.id},{leg:'outbound',origin:'Lavanderia',destination:'Canaã dos Carajás'}])status(await f.tripEdit(current,changes),400);
 const result=await f.tripEdit(current,{departedAt:'2026-10-03T11:10:00Z',arrivedAt:'2026-10-03T12:10:00Z'});status(result,200);assert.deepEqual(f.events(trip.id),originalEvents);assert.equal(result.data.trip.durationMinutes,60);assert.equal(result.data.trip.status,'arrived');assert.equal(JSON.parse(f.journal()[0].before_json).departedAt,'2026-10-03T11:00:00.000Z');
});

test('trip CAS loses to driver events and membership revocation without partial audit',async t=>{
 const f=await setup(t);const trip=await f.trip();f.beforeNextBatch(()=>f.sql.prepare('UPDATE transport_trips SET departed_at=?,revision=revision+1 WHERE id=?').run(new Date().toISOString(),trip.id));status(await f.tripEdit(trip,{origin:'Lost update'}),409);assert.equal(f.stored(trip.id).origin,trip.origin);assert.equal(f.journal().length,0);
 const planned=await f.trip();f.beforeNextBatch(()=>f.sql.prepare('UPDATE transport_memberships SET enabled=0 WHERE driver_id=?').run(B.id));status(await f.tripEdit(planned,{driverId:B.id}),409);assert.equal(f.stored(planned.id).driver_id,A.id);assert.equal(f.journal().length,0);
});

test('rol city and trip links stay consistent on correction and concurrent creation',async t=>{
 const f=await setup(t);const trip=await f.trip({lotIds:[f.rolId]});status(await f.edit('rols',f.rolId,{snapshot:{city:'Curianópolis'}}),400);status(await f.tripEdit(trip,{route:'Curianópolis'}),400);
 let result=await f.tripEdit(trip,{lotIds:[]});status(result,200);status(await f.edit('rols',f.rolId,{snapshot:{city:'Curianópolis'}}),200);status(await f.tripEdit(result.data.trip,{route:'Curianópolis',lotIds:[f.rolId]}),200);
 const other=await f.create({type:'rol',owner:f.owner,date:'2026-10-03',triageDate:'2026-10-03',shirts:1,pants:0});
 f.beforeNextBatch(()=>{const row=f.sql.prepare("SELECT body FROM uniform_records WHERE kind='rols' AND id=?").get(other);const body=JSON.parse(row.body);body.snapshot.city='Curianópolis';f.sql.prepare("UPDATE uniform_records SET body=? WHERE kind='rols' AND id=?").run(JSON.stringify(body),other)});
 const res=await f.req('/api/trips',{method:'POST',body:f.payload?{requestId:crypto.randomUUID(),route:'Canaã dos Carajás',leg:'inbound',origin:'Pickup',destination:'Lavanderia',driverId:A.id,lotIds:[other]}:{}});assert.ok([400,403,409].includes(res.status));
});

test('creation and assignment replay survive a later correction without losing original audit',async t=>{
 const f=await setup(t);const original={requestId:crypto.randomUUID(),route:'Canaã dos Carajás',leg:'inbound',origin:'Original pickup',destination:'Lavanderia',driverId:null,lotIds:[]};const created=await f.req('/api/trips',{method:'POST',body:original});status(created,200);let trip=created.data.trip;
 const assignRequest=crypto.randomUUID();status(await f.assign(trip.id,A.id,{}, {requestId:assignRequest}),200);trip=(await f.req('/api/trips')).data.trips.find(x=>x.id===trip.id);let edit=await f.tripEdit(trip,{origin:'Edited pickup',driverId:null});status(edit,200);
 status(await f.assign(trip.id,B.id),409);assert.equal(f.stored(trip.id).driver_id,null);assert.equal(f.events(trip.id).length,1);
 status(await f.assign(trip.id,A.id,{}, {requestId:assignRequest}),200);assert.equal(f.stored(trip.id).driver_id,null,'original replay must not reapply old driver');assert.equal(f.events(trip.id).length,1);
 const replay=await f.req('/api/trips',{method:'POST',body:original});status(replay,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.trip.origin,'Edited pickup');assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,1);
});

test('driver commands with obsolete revision cannot record a changed route or leg',async t=>{
 const f=await setup(t);const trip=await f.trip();const changed=await f.tripEdit(trip,{leg:'outbound',origin:'Lavanderia',destination:'Canaã dos Carajás'});status(changed,200);status(await f.event(trip.id,'depart',{}, {revision:trip.revision}),409);assert.equal(f.stored(trip.id).departed_at,null);
 const second=await f.trip();f.beforeNextBatch(()=>f.sql.prepare("UPDATE transport_trips SET leg='outbound',origin='Lavanderia',destination='Curianópolis',revision=revision+1 WHERE id=?").run(second.id));status(await f.event(second.id),409);assert.equal(f.stored(second.id).departed_at,null);assert.equal(f.events(second.id).length,0);
});
