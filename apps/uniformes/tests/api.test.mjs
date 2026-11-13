import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from '../src/worker.js';
const OWNER_SUBJECT='synthetic-owner-subject';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const tempDirectory=fs.mkdtempSync(join(tmpdir(),'uniformes-api-test-'));
const filename=join(tempDirectory,'test.sqlite');
process.on('exit',()=>fs.rmSync(tempDirectory,{recursive:true,force:true}));
let sql=new DatabaseSync(filename);sql.exec(fs.readFileSync(new URL('../drizzle/0000_skinny_midnight.sql',import.meta.url),'utf8'));
sql.exec(fs.readFileSync(new URL('../drizzle/0001_flat_vulture.sql',import.meta.url),'utf8'));
sql.exec(fs.readFileSync(new URL('../drizzle/0002_charming_skin.sql',import.meta.url),'utf8'));
sql.exec(fs.readFileSync(new URL('../drizzle/0003_productive_human_cannonball.sql',import.meta.url),'utf8'));
class Statement{constructor(query,args=[]){this.query=query;this.args=args}bind(...args){return new Statement(this.query,args)}async first(){return sql.prepare(this.query).get(...this.args)||null}async all(){return this.execute()}execute(){const s=sql.prepare(this.query);if(s.columns().length)return {results:s.all(...this.args),meta:{changes:0}};const r=s.run(...this.args);return {results:[],meta:{changes:Number(r.changes)}}}}
const DB={prepare:q=>new Statement(q),async batch(statements){sql.exec('BEGIN');try{const out=statements.map(s=>s.execute());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
async function req(path='state',method='GET',data=null,{user=OWNER_SUBJECT,mode='live',origin='https://pilot.test',db=DB}={}){const h={'content-type':'application/json',origin};if(user){h['oai-authenticated-user-id']=user;h['oai-authenticated-user-email']=user+'@example.test'}const r=await worker.fetch(new Request(`https://pilot.test/api/${path}?mode=${mode}`,{method,headers:h,body:data?JSON.stringify(data):undefined}),{DB:db,OWNER_SUBJECT});return {status:r.status,data:await r.json()}}
async function action(input,options={}){const state=await req('state','GET',null,options);return req('action','POST',{...input,version:state.data.version,requestId:crypto.randomUUID()},options)}
let checks=0;function ok(value,message){assert(value,message);checks++}
ok((await req('state','GET',null,{user:null})).status===401,'anonymous denied');
ok((await req('state','GET',null,{db:null})).status===503,'missing storage fails closed');
let s=await req();ok(s.status===200&&s.data.state.people.length===0&&s.data.version===0,'live starts empty');
let r=await action({type:'company',name:'Fictional company'});ok(r.status===200,'create company');const companyId=r.data.result.id;
ok((await action({type:'company',name:'Fictional company'})).status===400,'duplicate company');
r=await action({type:'destination',companyId,city:'Canaã dos Carajás',lodging:'Test only',block:'A',room:'1'});const destinationId=r.data.result.id;ok(r.status===200,'create destination');
r=await action({type:'person',companyId,destinationId,name:'Fictional 1',mat:'FIC001'});const owner=r.data.result.id;ok(r.status===200,'create employee');
r=await action({type:'piece',owner,pieceType:'Camisa'});const shirt=r.data.result.id;
r=await action({type:'piece',owner,pieceType:'Calça'});const pants=r.data.result.id;
ok(/^U-[A-F0-9]{12}$/.test(shirt)&&shirt!==pants,'distinct random codes');
r=await action({type:'rol',owner,date:'2026-10-03',triageDate:'2026-10-03',collectionTime:'07:00',due:'1900-01-01',dueAt:'1900-01-01T00:00:00Z',shirts:1,pants:1});const rolId=r.data.result.id;
ok(r.status===200,'create collection');ok(r.data.state.rols[0].dueAt==='2026-10-06T09:00:00-03:00','server calculates deadline ignoring client due');ok(r.data.state.rols[0].collectionTime==='07:00','collection time separate');
const sameDayRol = {type:'rol', owner, date:'2026-11-13', triageDate:'2026-11-13', shirts:1, pants:0};
const beforeInvalidSchedule = await req();
for (const collectionTime of ['09:01', '15:00']) {
 const rejected = await action({...sameDayRol, collectionTime});
 assert.equal(rejected.status, 400, `same-day collection at ${collectionTime} must be rejected`);
 assert.match(rejected.data.error, /triagem não pode começar antes da coleta/);
}
const afterInvalidSchedule = await req();
assert.equal(afterInvalidSchedule.data.version, beforeInvalidSchedule.data.version);
assert.deepEqual(afterInvalidSchedule.data.state.rols, beforeInvalidSchedule.data.state.rols);
for (const schedule of [{collectionTime:'09:00'}, {}, {collectionTime:'15:00', triageDate:'2026-11-14'}]) {
 const created = await action({...sameDayRol, ...schedule});
 assert.equal(created.status, 200, JSON.stringify(schedule));
 const saved = created.data.state.rols.find(row => row.id === created.data.result.id);
 assert.equal(saved.triageStartAt, `${schedule.triageDate ?? sameDayRol.triageDate}T09:00:00-03:00`);
}
for(const changes of [{triageDate:''},{triageDate:'2026-10-04'},{triageDate:'2026-02-30'},{collectionTime:'25:00'},{date:'2026-10-04',triageDate:'2026-10-05'},{triageDate:'2026-10-02'}])ok((await action({type:'rol',owner,date:'2026-10-03',triageDate:'2026-10-03',shirts:1,pants:0,...changes})).status===400,'invalid scheduling blocked');
ok((await action({type:'rol',owner,date:'2026-02-31',triageDate:'2026-10-03',collectionTime:'07:00',due:'1900-01-01',dueAt:'1900-01-01T00:00:00Z',shirts:1,pants:1})).status===400,'invalid date');
ok((await action({type:'exit',rolId,code:shirt})).status===400,'unreceived exit denied');
s=await req();const savedRequest={type:'entry',rolId,code:shirt,version:s.data.version,requestId:crypto.randomUUID()};r=await req('action','POST',savedRequest);ok(r.status===200,'entry saves');
const auditBefore=sql.prepare('SELECT COUNT(*) n FROM uniform_audit').get().n;r=await req('action','POST',savedRequest);ok(r.status===200&&r.data.replayed===true,'idempotent replay');ok(sql.prepare('SELECT COUNT(*) n FROM uniform_audit').get().n===auditBefore,'replay does not duplicate audit');
ok((await action({type:'entry',rolId,code:shirt})).status===400,'piece duplicate denied');
ok((await action({type:'dispatch',rolId})).status===400,'missing count blocks shipment');
r=await action({type:'entry',rolId,code:pants});ok(r.status===200,'pants entry');
ok((await action({type:'exit',rolId,code:shirt})).status===400,'dirty exit denied');
ok((await action({type:'wash',rolId})).status===200,'wash stage');ok((await action({type:'ready',rolId})).status===200,'clean stage');
ok((await action({type:'dispatch',rolId})).status===400,'outbound check required');
ok((await action({type:'exit',rolId,code:shirt})).status===200,'shirt outbound check');ok((await action({type:'exit',rolId,code:pants})).status===200,'pants outbound check');
ok((await action({type:'dispatch',rolId})).status===200,'complete dispatch');ok((await action({type:'entry',rolId,code:shirt})).status===400,'closed collection mutation denied');
r=await action({type:'rol',owner,date:'2026-10-03',triageDate:'2026-10-03',collectionTime:'07:00',due:'1900-01-01',dueAt:'1900-01-01T00:00:00Z',shirts:1,pants:0});const single=r.data.result.id;ok((await action({type:'entry',rolId:single,code:pants})).status===400,'unlisted pants rejected');ok((await action({type:'entry',rolId:single,code:shirt})).status===200,'piece reused after prior dispatch');
r=await action({type:'rol',owner,date:'2026-10-03',triageDate:'2026-10-03',collectionTime:'07:00',due:'1900-01-01',dueAt:'1900-01-01T00:00:00Z',shirts:1,pants:0});ok((await action({type:'entry',rolId:r.data.result.id,code:shirt})).status===400,'piece cannot be in two open collections');
r=await action({type:'person',companyId,destinationId,name:'Fictional 2',mat:'FIC002'});const p2=r.data.result.id;r=await action({type:'rol',owner:p2,date:'2026-10-03',triageDate:'2026-10-03',collectionTime:'07:00',due:'1900-01-01',dueAt:'1900-01-01T00:00:00Z',shirts:1,pants:0});ok((await action({type:'entry',rolId:r.data.result.id,code:shirt})).status===400,'wrong employee denied');
ok((await req('state','GET',null,{user:'test-owner-b'})).status===403,'unknown identity cannot read');ok((await req('action','POST',{type:'entry',rolId,code:shirt},{user:'test-owner-b'})).status===403,'unknown identity cannot mutate');
ok((await action({type:'company',name:'Injected',tenant:'test-owner-b'})).status===400,'client tenant rejected');
ok((await action({type:'company',name:'Origin'}, {origin:'https://evil.test'})).status===403,'cross-origin rejected');
ok((await action({type:'seed'})).status===400,'demo seed refused in live');ok((await action({type:'seed'},{mode:'demo'})).status===200,'explicit isolated demo seed');ok((await req()).data.state.companies[0].name==='Fictional company','demo does not contaminate live');
s=await req();const race=await Promise.all(['Race 1','Race 2'].map(name=>req('action','POST',{type:'company',name,version:s.data.version,requestId:crypto.randomUUID()})));ok(race.filter(x=>x.status===200).length===1&&race.filter(x=>x.status===409).length===1,'concurrent version conflict prevents overwrite');
const final=await req();const second=await req();ok(JSON.stringify(final.data.state)===JSON.stringify(second.data.state),'independent client reads shared records');sql.close();sql=new DatabaseSync(filename);ok((await req()).data.version===final.data.version,'persistence survives database reopen');
const exported=await req('export');ok(exported.data.state.pieces.length===2&&exported.data.audit.length>10,'complete export includes records and audit');ok((await req('export','GET',null,{user:'test-owner-b'})).status===403,'export rejects unknown identity');
const restore=new DatabaseSync(':memory:');restore.exec(fs.readFileSync(new URL('../drizzle/0000_skinny_midnight.sql',import.meta.url),'utf8'));for(const[kind,rows]of Object.entries(exported.data.state))for(const row of rows)restore.prepare('INSERT INTO uniform_records(tenant,mode,kind,id,company_id,body) VALUES(?,?,?,?,?,?)').run('restored','live',kind,row.id,row.companyId||'',JSON.stringify(row));ok(restore.prepare('SELECT COUNT(*) n FROM uniform_records').get().n===Object.values(exported.data.state).reduce((n,a)=>n+a.length,0),'export record restore round trip');
console.log(`PASS ${checks} SQLite-backed API assertions. Actual platform auth and physical phone camera remain external acceptance checks.`);sql.close();restore.close();
