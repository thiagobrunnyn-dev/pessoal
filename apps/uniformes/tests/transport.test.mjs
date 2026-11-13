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
function safeDriverPayload(value){
 const forbidden=new Set(['tenant','tenantId','subject','userId','actor','email','employee','employees','people','pieces','rols','lots','lotIds','lot_ids','snapshot','mat','companyId','company_id','created_request','last_request','request_id']);
 function visit(node){if(!node||typeof node!=='object')return;for(const [key,item]of Object.entries(node)){assert.ok(!forbidden.has(key),`driver response exposes ${key}`);visit(item)}}
 visit(value);
 const encoded=JSON.stringify(value);for(const secret of [OWNER_SUBJECT,A.subject,B.subject,'SECRET_EMPLOYEE','SECRET_MATRICULA','SECRET_LOT'])assert.ok(!encoded.includes(secret),`driver response exposes private value ${secret}`);
}

test('anonymous requests fail closed across API and asset surfaces',async t=>{
 const f=fixture(t);
 for(const path of ['/','/index.html','/app.js','/motorista','/api/health','/api/state','/api/trips','/api/driver/trips'])status(await f.req(path,{subject:null,email:null}),401,path);
 status(await f.req('/api/trips',{email:null}),401,'missing authentication email');
 status(await f.req('/api/trips',{subject:null}),401,'missing authenticated subject');
});

test('unknown subject cannot authenticate by copying owner email, claims, or headers',async t=>{
 const f=fixture(t);
 for(const path of ['/','/index.html','/app.js','/motorista','/api/health','/api/state','/api/export','/api/trips','/api/driver/trips'])status(await f.req(path,{subject:'synthetic-unknown',email:OWNER_EMAIL,headers:{'x-user-role':'owner','x-tenant-id':OWNER_SUBJECT}}),403,path);
 status(await f.req('/api/action',{subject:'synthetic-unknown',method:'POST',body:{type:'seed',requestId:crypto.randomUUID(),version:0}}),403,'unknown office mutation');
 status(await f.event('missing','depart',{subject:'synthetic-unknown'}),403,'unknown driver mutation');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_memberships').get().n,5,'requests never auto-provision memberships');
});

test('empty membership table authorizes only the pinned owner',async t=>{
 const f=fixture(t,{members:false});
 status(await f.req('/api/trips'),200,'pinned owner');
 status(await f.req('/api/driver/trips',{subject:A.subject}),403,'unapproved driver');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_memberships').get().n,0);
 const preview=await f.req('/api/driver/trips');status(preview,200);assert.equal(preview.data.preview,true);assert.deepEqual(preview.data.trips,[]);
 const list=await f.req('/api/trips');assert.deepEqual(list.data.trips,[]);assert.deepEqual(list.data.drivers,[]);
});

test('disabled and foreign-tenant memberships confer no access',async t=>{
 const f=fixture(t);
 for(const subject of [DISABLED.subject,'synthetic-foreign-member'])for(const path of ['/motorista','/api/trips','/api/driver/trips'])status(await f.req(path,{subject}),403,`${subject} ${path}`);
});

test('driver cannot read or mutate office APIs or office application assets',async t=>{
 const f=fixture(t);
 for(const path of ['/api/state','/api/export','/api/trips','/index.html','/app.js','/vendor.js'])status(await f.req(path,{subject:A.subject}),403,path);
 for(const method of ['GET','HEAD'])status(await f.req('/app.js',{subject:A.subject,method}),403,`${method} office script`);
 status(await f.req('/api/action',{subject:A.subject,method:'POST',body:{type:'seed',requestId:crypto.randomUUID(),version:0}}),403,'office action');
 status(await f.create({}, {subject:A.subject}),403,'driver trip creation');
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM uniform_records').get().n,0);
});

test('no membership-granting API is exposed and payload claims cannot assign privileges',async t=>{
 const f=fixture(t);
 for(const path of ['/api/memberships','/api/drivers','/api/driver/membership']){
  const r=await f.req(path,{method:'POST',body:{subject:'synthetic-unknown',driverId:'new-driver',enabled:1,role:'owner'}});
  assert.ok([403,404,405].includes(r.status),`${path}: ${r.status} ${r.text}`);
 }
 for(const extra of [{tenant:OWNER_SUBJECT},{subject:A.subject},{role:'owner'},{enabled:1},{userId:OWNER_SUBJECT}])status(await f.create(extra),400,`reject claimed ${Object.keys(extra)[0]}`);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_memberships').get().n,5);
});

test('storage and environment errors fail closed',async t=>{
 const f=fixture(t);
 for(const path of ['/api/trips','/api/driver/trips'])status(await f.req(path,{db:null}),503,path);
 status(await f.req('/api/trips',{mode:'production'}),400,'invalid mode');
 status(await f.req('/api/driver/trips',{subject:A.subject,mode:'demo'}),403,'live-only membership in demo');
 status(await f.req('/api/driver/trips',{subject:DEMO.subject,mode:'live'}),403,'demo-only membership in live');
});

test('owner can create an unassigned trip without granting any access',async t=>{
 const f=fixture(t,{members:false});
 const trip=await f.trip({driverId:null});
 assert.equal(f.stored(trip.id).driver_id,null);
 const list=await f.req('/api/trips');assert.equal(list.data.trips.length,1);assert.deepEqual(list.data.drivers,[]);
 status(await f.event(trip.id,'depart',{subject:'synthetic-unapproved'}),403);
 assert.equal(f.events(trip.id).length,0);
});

test('assignments accept only enabled memberships in the same tenant and mode',async t=>{
 const f=fixture(t);
 const good=await f.trip();assert.equal(f.stored(good.id).driver_id,A.id);
 for(const driverId of ['missing-driver',DISABLED.id,DEMO.id,'foreign-driver',A.subject])status(await f.create({driverId}),403,`assignment ${driverId}`);
 const list=await f.req('/api/trips');status(list,200);assert.equal(list.data.drivers.length,2);
 const driverText=JSON.stringify(list.data.drivers);assert.ok(driverText.includes(A.name));assert.ok(driverText.includes(B.name));assert.ok(!driverText.includes(DISABLED.name));assert.ok(!driverText.includes(DEMO.name));
});

test('driver only sees own assigned trips and receives a minimized projection',async t=>{
 const f=fixture(t);
 const mine=await f.trip();await f.trip({driverId:B.id});await f.trip({driverId:null});
 // Seed synthetic office data and a linked lot directly in this local fixture only.
 f.sql.prepare('INSERT INTO uniform_records(tenant,mode,kind,id,company_id,body) VALUES(?,?,?,?,?,?)').run(OWNER_SUBJECT,'live','rols','SECRET_LOT','SECRET_COMPANY',JSON.stringify({id:'SECRET_LOT',snapshot:{name:'SECRET_EMPLOYEE',mat:'SECRET_MATRICULA'}}));
 f.sql.prepare('UPDATE transport_trips SET lot_ids=? WHERE id=?').run('["SECRET_LOT"]',mine.id);
 const result=await f.req('/api/driver/trips',{subject:A.subject});status(result,200);assert.equal(result.data.name,A.name);assert.equal(result.data.preview,false);assert.equal(result.data.trips.length,1);assert.equal(result.data.trips[0].id,mine.id);safeDriverPayload(result.data);
 const other=await f.req('/api/driver/trips',{subject:B.subject});status(other,200);assert.equal(other.data.trips.length,1);assert.notEqual(other.data.trips[0].id,mine.id);safeDriverPayload(other.data);
});

test('other-driver, unknown and unassigned trip IDs are forbidden without audit writes',async t=>{
 const f=fixture(t);const mine=await f.trip();const unassigned=await f.trip({driverId:null});
 for(const [id,subject] of [[mine.id,B.subject],['missing-trip',A.subject],[unassigned.id,A.subject]])status(await f.event(id,'depart',{subject}),403,`${subject} cannot touch ${id}`);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_events').get().n,0);
 assert.equal(f.stored(mine.id).departed_at,null);
});

test('owner preview cannot write driver events',async t=>{
 const f=fixture(t);const trip=await f.trip();status(await f.event(trip.id,'depart',{subject:OWNER_SUBJECT}),403);
 assert.equal(f.stored(trip.id).departed_at,null);assert.equal(f.events(trip.id).length,0);
});

test('live and demo trips and mutations remain isolated',async t=>{
 const f=fixture(t);const live=await f.trip();const demo=await f.trip({driverId:DEMO.id,route:'Curianópolis'},{mode:'demo'});
 const liveOwner=await f.req('/api/trips');const demoOwner=await f.req('/api/trips',{mode:'demo'});assert.deepEqual(liveOwner.data.trips.map(x=>x.id),[live.id]);assert.deepEqual(demoOwner.data.trips.map(x=>x.id),[demo.id]);
 const list=await f.req('/api/driver/trips',{subject:DEMO.subject,mode:'demo'});status(list,200);assert.deepEqual(list.data.trips.map(x=>x.id),[demo.id]);
 status(await f.event(live.id,'depart',{subject:DEMO.subject,mode:'demo'}),403,'demo member cannot mutate live trip');
 status(await f.event(demo.id,'depart',{subject:A.subject,mode:'live'}),403,'live member cannot mutate demo trip');
 status(await f.event(demo.id,'depart',{subject:DEMO.subject,mode:'demo'}),200,'demo event');
 assert.equal(f.stored(live.id).departed_at,null);assert.equal(f.events(live.id).length,0);assert.equal(f.events(demo.id).length,1);
});

test('strict transport payloads reject client timestamps and unexpected fields',async t=>{
 const f=fixture(t);const trip=await f.trip();
 for(const field of ['timestamp','departedAt','arrivedAt','createdAt','created_at','departed_at','arrived_at','tenant','driverId','subject','userId','role','base','lotIds'])status(await f.event(trip.id,'depart',{}, {[field]:'2099-01-01T00:00:00Z'}),400,`event ${field}`);
 for(const field of ['timestamp','departedAt','arrivedAt','createdAt','created_at','departed_at','arrived_at','base'])status(await f.create({[field]:'2099-01-01T00:00:00Z'}),400,`create ${field}`);
 assert.equal(f.events(trip.id).length,0);assert.equal(f.stored(trip.id).departed_at,null);
});

test('invalid routes, legs, text, IDs and event types are rejected',async t=>{
 const f=fixture(t);const trip=await f.trip();
 for(const changes of [{route:'Parauapebas'},{leg:'sideways'},{origin:''},{destination:''},{requestId:'not-a-uuid'},{lotIds:'[]'}])status(await f.create(changes),400,`create ${JSON.stringify(changes)}`);
 for(const changes of [{requestId:'bad'},{event:'wash'},{event:'dispatch'},{event:''}])status(await f.event(trip.id,'depart',{},changes),400,`event ${JSON.stringify(changes)}`);
 assert.equal(f.events(trip.id).length,0);
});

test('transport mutations reject cross-origin and non-JSON requests',async t=>{
 const f=fixture(t);const trip=await f.trip();
 for(const origin of ['https://evil.test',null]){
  status(await f.create({}, {origin}),403,'trip origin');status(await f.event(trip.id,'depart',{origin}),403,'event origin');
 }
 status(await f.create({}, {contentType:'text/plain'}),415,'trip content type');status(await f.event(trip.id,'depart',{contentType:'text/plain'}),415,'event content type');
 for(const path of ['/api/trips','/api/driver/event'])status(await f.req(path,{method:'POST',subject:path.includes('driver')?A.subject:OWNER_SUBJECT,raw:'{'}),400,`malformed ${path}`);
 assert.equal(f.events(trip.id).length,0);
});

test('inbound depart then arrive uses server time and writes one audit row per transition',async t=>{
 const f=fixture(t);const trip=await f.trip();
 const early=await f.event(trip.id,'arrive');assert.ok([400,409].includes(early.status),early.text);assert.equal(f.events(trip.id).length,0);
 const before=Date.now();const depart=await f.event(trip.id);const after=Date.now();status(depart,200);safeDriverPayload(depart.data);
 const departed=f.stored(trip.id);assert.ok(Date.parse(departed.departed_at)>=before&&Date.parse(departed.departed_at)<=after,'departure timestamp set by server');assert.equal(departed.arrived_at,null);assert.equal(f.events(trip.id).length,1);
 const arrive=await f.event(trip.id,'arrive');status(arrive,200);safeDriverPayload(arrive.data);
 const arrived=f.stored(trip.id);assert.ok(Date.parse(arrived.arrived_at)>=Date.parse(arrived.departed_at));assert.equal(arrived.departed_at,departed.departed_at);assert.equal(f.events(trip.id).length,2);
 assert.deepEqual(f.events(trip.id).map(x=>x.kind).sort(),['arrive','depart']);for(const event of f.events(trip.id)){assert.equal(event.actor,A.subject);assert.equal(event.tenant,OWNER_SUBJECT);assert.equal(event.mode,'live')}
});

test('outbound trip permits departure only',async t=>{
 const f=fixture(t);const trip=await f.trip({leg:'outbound',origin:'Lavanderia',destination:'Synthetic Curianópolis dropoff',route:'Curianópolis'});
 const early=await f.event(trip.id,'arrive');assert.ok([400,409].includes(early.status),early.text);
 status(await f.event(trip.id,'depart'),200);const late=await f.event(trip.id,'arrive');assert.ok([400,409].includes(late.status),late.text);
 assert.equal(f.stored(trip.id).arrived_at,null);assert.equal(f.events(trip.id).length,1);
});

test('trip creation replay is idempotent and conflicting request ID reuse returns 409',async t=>{
 const f=fixture(t);const payload=f.payload();const first=await f.req('/api/trips',{method:'POST',body:payload});status(first,200);
 const repeat=await f.req('/api/trips',{method:'POST',body:payload});status(repeat,200);assert.deepEqual(repeat.data.trip,first.data.trip);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,1);
 for(const change of [{origin:'Conflicting origin'},{driverId:B.id},{leg:'outbound',origin:'Lavanderia',destination:'Synthetic delivery'}])status(await f.req('/api/trips',{method:'POST',body:{...payload,...change}}),409,`conflicting create ${Object.keys(change)[0]}`);
 assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,1);
});

test('event replay preserves timestamp and audit; conflicting request ID reuse returns 409',async t=>{
 const f=fixture(t);const trip=await f.trip();const other=await f.trip();const requestId=crypto.randomUUID();
 const first=await f.event(trip.id,'depart',{}, {requestId});status(first,200);const stored=f.stored(trip.id);
 const replay=await f.event(trip.id,'depart',{}, {requestId});status(replay,200);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.trip,first.data.trip);assert.equal(f.stored(trip.id).departed_at,stored.departed_at);assert.equal(f.events(trip.id).length,1);
 status(await f.event(trip.id,'arrive',{}, {requestId}),409,'same key different event');status(await f.event(other.id,'depart',{}, {requestId}),409,'same key different trip');
 assert.equal(f.events(trip.id).length,1);assert.equal(f.events(other.id).length,0);assert.equal(f.stored(trip.id).arrived_at,null);
});

test('duplicate event under a new key cannot alter timestamps or duplicate the audit',async t=>{
 const f=fixture(t);const trip=await f.trip();status(await f.event(trip.id),200);const original=f.stored(trip.id);
 const duplicate=await f.event(trip.id);assert.ok([200,400,409].includes(duplicate.status),duplicate.text);assert.equal(f.events(trip.id).length,1);assert.equal(f.stored(trip.id).departed_at,original.departed_at);
 status(await f.event(trip.id,'arrive'),200);const arrived=f.stored(trip.id);const duplicateArrival=await f.event(trip.id,'arrive');assert.ok([200,400,409].includes(duplicateArrival.status),duplicateArrival.text);assert.equal(f.events(trip.id).length,2);assert.equal(f.stored(trip.id).arrived_at,arrived.arrived_at);
});

test('concurrent departure requests produce a single transition and audit row',async t=>{
 const f=fixture(t);const trip=await f.trip();
 const results=await Promise.all(Array.from({length:4},()=>f.event(trip.id)));
 assert.ok(results.some(x=>x.status===200),'one departure succeeds');for(const result of results)assert.ok([200,400,409].includes(result.status),`concurrent event: ${result.status} ${result.text}`);
 assert.equal(f.events(trip.id).length,1);const row=f.stored(trip.id);assert.ok(row.departed_at);assert.equal(row.arrived_at,null);assert.equal(f.events(trip.id)[0].created_at,row.departed_at);
});

test('concurrent replay of a single request ID is idempotent',async t=>{
 const f=fixture(t);const trip=await f.trip();const requestId=crypto.randomUUID();
 const results=await Promise.all(Array.from({length:3},()=>f.event(trip.id,'depart',{}, {requestId})));
 assert.ok(results.some(x=>x.status===200));for(const result of results)assert.ok([200,409].includes(result.status),`concurrent replay: ${result.status} ${result.text}`);
 assert.equal(f.events(trip.id).length,1);const replay=await f.event(trip.id,'depart',{}, {requestId});status(replay,200);assert.equal(replay.data.replayed,true);
});

test('revoking membership immediately blocks previously assigned trips',async t=>{
 const f=fixture(t);const trip=await f.trip();status(await f.req('/api/driver/trips',{subject:A.subject}),200);
 f.sql.prepare('UPDATE transport_memberships SET enabled=0 WHERE subject=?').run(A.subject);
 status(await f.req('/api/driver/trips',{subject:A.subject}),403);status(await f.event(trip.id),403);assert.equal(f.events(trip.id).length,0);
});

test('same event request ID racing across different trips cannot mutate both',async t=>{
 const f=fixture(t);const first=await f.trip();const second=await f.trip();const requestId=crypto.randomUUID();
 const results=await Promise.all([f.event(first.id,'depart',{}, {requestId}),f.event(second.id,'depart',{}, {requestId})]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 assert.equal(f.events(first.id).length+f.events(second.id).length,1);
 assert.equal([f.stored(first.id),f.stored(second.id)].filter(x=>x.departed_at!==null).length,1,'losing trip must remain unmodified');
});

test('concurrent trip creation with the same key creates exactly one trip',async t=>{
 const f=fixture(t);const payload=f.payload();
 const results=await Promise.all(Array.from({length:3},()=>f.req('/api/trips',{method:'POST',body:payload})));
 for(const result of results)status(result,200);assert.equal(new Set(results.map(x=>x.data.trip.id)).size,1);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,1);
});

test('concurrent conflicting trip creations share one request ID without silently succeeding',async t=>{
 const f=fixture(t);const payload=f.payload();
 const results=await Promise.all(['First synthetic pickup','Second synthetic pickup'].map(origin=>f.req('/api/trips',{method:'POST',body:{...payload,origin}})));
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,1);
 const saved=f.sql.prepare('SELECT * FROM transport_trips').get();assert.equal(saved.origin,results.find(x=>x.status===200).data.trip.origin);
});

test('a replay request cannot be used to retrieve another driver’s trip',async t=>{
 const f=fixture(t);const tripA=await f.trip();const tripB=await f.trip({driverId:B.id});const requestId=crypto.randomUUID();
 status(await f.event(tripA.id,'depart',{}, {requestId}),200);
 const stolen=await f.event(tripA.id,'depart',{subject:B.subject},{requestId});status(stolen,403);assert.ok(!stolen.text.includes(tripA.id));assert.equal(stolen.data.trip,undefined);
 const conflicted=await f.event(tripB.id,'depart',{subject:B.subject},{requestId});status(conflicted,409);assert.equal(conflicted.data.trip,undefined);assert.equal(f.stored(tripB.id).departed_at,null);assert.equal(f.events(tripB.id).length,0);
});

test('the same subject may have explicit independent memberships in both modes',async t=>{
 const f=fixture(t);f.member(A,'demo');const requestId=crypto.randomUUID();
 const live=await f.trip({requestId});const demo=await f.trip({requestId},{mode:'demo'});assert.notEqual(live.id,demo.id);
 const eventRequestId=crypto.randomUUID();status(await f.event(live.id,'depart',{}, {requestId:eventRequestId}),200);status(await f.event(demo.id,'depart',{mode:'demo'},{requestId:eventRequestId}),200);
 for(const [mode,trip]of [['live',live],['demo',demo]]){const response=await f.req('/api/driver/trips',{subject:A.subject,mode});status(response,200);assert.deepEqual(response.data.trips.map(x=>x.id),[trip.id]);assert.equal(f.events(trip.id).length,1);assert.equal(f.events(trip.id)[0].mode,mode)}
});

test('lot associations require the same tenant, mode, and city without exposing office records',async t=>{
 const f=fixture(t);
 function lot(id,{tenant=OWNER_SUBJECT,mode='live',city='Canaã dos Carajás'}={}){f.sql.prepare('INSERT INTO uniform_records(tenant,mode,kind,id,company_id,body) VALUES(?,?,?,?,?,?)').run(tenant,mode,'rols',id,'SECRET_COMPANY',JSON.stringify({id,snapshot:{city,name:'SECRET_EMPLOYEE',mat:'SECRET_MATRICULA'}}))}
 lot('SECRET_LOT');lot('wrong-city',{city:'Curianópolis'});lot('foreign-tenant',{tenant:'synthetic-other-tenant'});lot('demo-lot',{mode:'demo'});
 const trip=await f.trip({lotIds:['SECRET_LOT']});assert.equal(f.stored(trip.id).lot_ids,'["SECRET_LOT"]');
 for(const lotId of ['missing-lot','wrong-city','foreign-tenant','demo-lot'])status(await f.create({lotIds:[lotId]}),400,`invalid lot ${lotId}`);
 status(await f.create({lotIds:['SECRET_LOT','SECRET_LOT']}),400,'duplicate lot');
 const response=await f.req('/api/driver/trips',{subject:A.subject});status(response,200);safeDriverPayload(response.data);
 const before=f.sql.prepare('SELECT body FROM uniform_records ORDER BY id').all();status(await f.event(trip.id),200);status(await f.event(trip.id,'arrive'),200);assert.deepEqual(f.sql.prepare('SELECT body FROM uniform_records ORDER BY id').all(),before,'driver event must not alter employee/laundry records');
});

test('oversized and non-object transport payloads fail without storing anything',async t=>{
 const f=fixture(t);const trip=await f.trip();
 for(const body of [null,[],42,'arbitrary text'])for(const [path,subject] of [['/api/trips',OWNER_SUBJECT],['/api/driver/event',A.subject]])status(await f.req(path,{subject,method:'POST',body}),400,`${path} ${JSON.stringify(body)}`);
 for(const [path,subject] of [['/api/trips',OWNER_SUBJECT],['/api/driver/event',A.subject]])status(await f.req(path,{subject,method:'POST',body:{padding:'a'.repeat(21000)}}),413,`oversized ${path}`);
 assert.equal(f.events(trip.id).length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,1);
});

test('owner export includes persisted transport audit and drivers cannot access it',async t=>{
 const f=fixture(t);const trip=await f.trip();status(await f.event(trip.id),200);
 const response=await f.req('/api/export');status(response,200);assert.equal(response.data.transport.trips.length,1);assert.equal(response.data.transport.trips[0].id,trip.id);assert.equal(response.data.transport.events.length,1);assert.equal(response.data.transport.events[0].trip_id,trip.id);
 status(await f.req('/api/export',{subject:A.subject}),403);
});

test('membership revoked after authorization but before commit prevents a driver transition',async t=>{
 const f=fixture(t);const trip=await f.trip();
 f.beforeNextBatch(()=>f.sql.prepare('UPDATE transport_memberships SET enabled=0 WHERE subject=?').run(A.subject));
 const response=await f.event(trip.id);assert.ok([403,409].includes(response.status),response.text);assert.equal(f.stored(trip.id).departed_at,null);assert.equal(f.events(trip.id).length,0);
 status(await f.req('/api/driver/trips',{subject:A.subject}),403,'subsequent access denied');
});

test('trip reassigned before commit cannot be changed by the previous driver',async t=>{
 const f=fixture(t);const trip=await f.trip();
 f.beforeNextBatch(()=>f.sql.prepare('UPDATE transport_trips SET driver_id=? WHERE id=?').run(B.id,trip.id));
 const response=await f.event(trip.id);assert.ok([403,409].includes(response.status),response.text);assert.equal(f.stored(trip.id).departed_at,null);assert.equal(f.events(trip.id).length,0);
 const former=await f.req('/api/driver/trips',{subject:A.subject});assert.deepEqual(former.data.trips,[]);const current=await f.req('/api/driver/trips',{subject:B.subject});assert.deepEqual(current.data.trips.map(x=>x.id),[trip.id]);
});

test('replaying departure after arrival preserves both stored server timestamps',async t=>{
 const f=fixture(t);const trip=await f.trip();const requestId=crypto.randomUUID();status(await f.event(trip.id,'depart',{}, {requestId}),200);status(await f.event(trip.id,'arrive'),200);const completed=f.stored(trip.id);
 const replay=await f.event(trip.id,'depart',{}, {requestId});status(replay,200);assert.equal(replay.data.replayed,true);assert.equal(replay.data.trip.departedAt,completed.departed_at);assert.equal(replay.data.trip.arrivedAt,completed.arrived_at);assert.equal(f.events(trip.id).length,2);safeDriverPayload(replay.data);
});

test('approved driver can load only driver and shared assets',async t=>{
 const f=fixture(t);
 for(const path of ['/motorista','/driver.html','/driver.js','/styles.css','/mbl-logo.jpeg'])for(const method of ['GET','HEAD']){const response=await f.req(path,{subject:A.subject,method});status(response,200,`${method} ${path}`);assert.equal(response.headers.get('cache-control'),'no-store');if(method==='HEAD')assert.equal(response.text,'')}
 for(const path of ['/','/viagens','/index.html','/transport.html','/transport.js','/transport.css','/app.js','/vendor.js'])status(await f.req(path,{subject:A.subject}),403,path);
 const preview=await f.req('/motorista');status(preview,200,'owner preview page');
});

test('owner can assign an unassigned planned trip exactly once with an owner audit',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});const before=Date.now();const assigned=await f.assign(trip.id);const after=Date.now();status(assigned,200);assert.equal(assigned.data.trip.driverId,A.id);assert.equal(f.stored(trip.id).driver_id,A.id);
 const events=f.events(trip.id);assert.equal(events.length,1);assert.equal(events[0].kind,'assign');assert.equal(events[0].actor,OWNER_SUBJECT);assert.ok(Date.parse(events[0].created_at)>=before&&Date.parse(events[0].created_at)<=after);assert.equal(f.stored(trip.id).departed_at,null);
 const own=await f.req('/api/driver/trips',{subject:A.subject});assert.deepEqual(own.data.trips.map(x=>x.id),[trip.id]);safeDriverPayload(own.data);
 status(await f.assign(trip.id,B.id),409,'cannot replace assigned driver');status(await f.assign(trip.id,A.id),409,'new key cannot create duplicate assignment');assert.equal(f.events(trip.id).length,1);
});

test('drivers and unknown users cannot assign trips or self-grant access',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});
 for(const subject of [A.subject,B.subject,DEMO.subject,'synthetic-unknown'])status(await f.assign(trip.id,A.id,{subject}),403,`${subject} assignment`);
 assert.equal(f.stored(trip.id).driver_id,null);assert.equal(f.events(trip.id).length,0);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_memberships').get().n,5);
});

test('assignment requires an enabled existing member in the trip tenant and mode',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});
 for(const driverId of ['missing-driver',DISABLED.id,DEMO.id,'foreign-driver'])status(await f.assign(trip.id,driverId),403,`assign ${driverId}`);
 const demoTrip=await f.trip({driverId:null},{mode:'demo'});status(await f.assign(demoTrip.id,A.id,{mode:'demo'}),403,'live member not assignable in demo');
 status(await f.assign(demoTrip.id,DEMO.id,{mode:'demo'}),200,'demo member');assert.equal(f.stored(trip.id).driver_id,null);assert.equal(f.events(trip.id).length,0);
});

test('assignment idempotency preserves audit time and rejects a changed driver or trip',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});const other=await f.trip({driverId:null});const requestId=crypto.randomUUID();
 const first=await f.assign(trip.id,A.id,{}, {requestId});status(first,200);const firstAudit=f.events(trip.id)[0];
 const replay=await f.assign(trip.id,A.id,{}, {requestId});status(replay,200);assert.equal(replay.data.replayed,true);assert.deepEqual(replay.data.trip,first.data.trip);assert.deepEqual(f.events(trip.id),[firstAudit]);
 status(await f.assign(trip.id,B.id,{}, {requestId}),409,'conflicting driver');status(await f.assign(other.id,A.id,{}, {requestId}),409,'conflicting trip');assert.equal(f.stored(other.id).driver_id,null);assert.equal(f.events(other.id).length,0);
});

test('assignment cannot replace the driver of a started trip or claim an unassigned started trip',async t=>{
 const f=fixture(t);const assigned=await f.trip();status(await f.event(assigned.id),200);status(await f.assign(assigned.id,B.id),409,'started assigned trip');
 const unassigned=await f.trip({driverId:null});f.sql.prepare('UPDATE transport_trips SET departed_at=? WHERE id=?').run('2026-10-03T20:00:00.000Z',unassigned.id);
 status(await f.assign(unassigned.id,A.id),409,'already-started unassigned trip');assert.equal(f.stored(unassigned.id).driver_id,null);assert.equal(f.events(unassigned.id).length,0);
});

test('assignment rejects unexpected payload fields, bad origins and bad content types',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});
 for(const extra of [{tenant:OWNER_SUBJECT},{subject:A.subject},{timestamp:'2099-01-01T00:00:00Z'},{role:'driver'},{enabled:1}])status(await f.assign(trip.id,A.id,{},extra),400,`unexpected ${Object.keys(extra)[0]}`);
 status(await f.assign(trip.id,A.id,{origin:'https://evil.test'}),403);status(await f.assign(trip.id,A.id,{contentType:'text/plain'}),415);status(await f.assign(trip.id,A.id,{}, {requestId:'bad-id'}),400);
 assert.equal(f.stored(trip.id).driver_id,null);assert.equal(f.events(trip.id).length,0);
});

test('concurrent different-driver assignments have one winner and one audit row',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});const results=await Promise.all([f.assign(trip.id,A.id),f.assign(trip.id,B.id)]);
 assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.events(trip.id).length,1);assert.equal(f.events(trip.id)[0].kind,'assign');assert.equal(f.stored(trip.id).driver_id,results.find(x=>x.status===200).data.trip.driverId);
});

test('concurrent identical assignment replays remain idempotent',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});const requestId=crypto.randomUUID();const results=await Promise.all(Array.from({length:3},()=>f.assign(trip.id,A.id,{}, {requestId})));
 for(const result of results)status(result,200);assert.equal(f.events(trip.id).length,1);assert.equal(f.stored(trip.id).driver_id,A.id);
});

test('same assignment request ID cannot concurrently assign two trips',async t=>{
 const f=fixture(t);const first=await f.trip({driverId:null});const second=await f.trip({driverId:null});const requestId=crypto.randomUUID();
 const results=await Promise.all([f.assign(first.id,A.id,{}, {requestId}),f.assign(second.id,A.id,{}, {requestId})]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);assert.equal(f.events(first.id).length+f.events(second.id).length,1);assert.equal([f.stored(first.id),f.stored(second.id)].filter(x=>x.driver_id!==null).length,1);
});

test('membership revoked before assignment commit cannot receive an assignment',async t=>{
 const f=fixture(t);const trip=await f.trip({driverId:null});f.beforeNextBatch(()=>f.sql.prepare('UPDATE transport_memberships SET enabled=0 WHERE subject=?').run(A.subject));
 const response=await f.assign(trip.id,A.id);assert.ok([403,409].includes(response.status),`revoked membership assignment: ${response.status} ${response.text}`);assert.equal(f.stored(trip.id).driver_id,null);assert.equal(f.events(trip.id).length,0);
});

test('membership revoked before trip creation commit cannot receive an assigned trip',async t=>{
 const f=fixture(t);f.beforeNextBatch(()=>f.sql.prepare('UPDATE transport_memberships SET enabled=0 WHERE subject=?').run(A.subject));
 const response=await f.create();assert.ok([403,409].includes(response.status),`revoked membership create: ${response.status} ${response.text}`);assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM transport_trips').get().n,0);
});

test('office keeps driver attribution after access revocation without offering new assignments',async t=>{
 const f=fixture(t);const trip=await f.trip();
 f.sql.prepare('UPDATE transport_memberships SET enabled=0 WHERE subject=?').run(A.subject);
 const list=await f.req('/api/trips');status(list,200);
 assert.equal(list.data.trips.find(x=>x.id===trip.id).driverName,A.name);
 assert.ok(!list.data.drivers.some(x=>x.id===A.id));
 status(await f.req('/api/driver/trips',{subject:A.subject}),403);
});

test('complete owner backup is not silently limited to the screen page size',async t=>{
 const f=fixture(t);const sample=await f.trip();
 const insert=f.sql.prepare('INSERT INTO transport_trips(id,tenant,mode,driver_id,route,base,leg,origin,destination,lot_ids,created_at,created_request) SELECT ?,tenant,mode,driver_id,route,base,leg,origin,destination,lot_ids,created_at,? FROM transport_trips WHERE id=?');
 for(let i=0;i<1001;i++)insert.run('VIA-export-'+i,'export-request-'+i,sample.id);
 const screen=await f.req('/api/trips');assert.equal(screen.data.trips.length,1000);
 const backup=await f.req('/api/export');status(backup,200);assert.equal(backup.data.transport.trips.length,1002);
});
