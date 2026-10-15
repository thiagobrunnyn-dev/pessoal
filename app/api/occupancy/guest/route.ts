import {getOperator,recheckOperator,operatorGuard} from '../../../../lib/app-access';
import {all,first,noCache} from '../../../../lib/maintenance';
import {savePersonProfile} from '../../../../lib/person-profiles';
import {boundedJson,requireSameOrigin,RequestError} from '../../../../lib/http-security';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:noCache});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const normalized=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/gu,' ');
export async function POST(request:Request){try{
 const op=await getOperator();if(!op)return reply({error:'Acesso restrito à gestão autorizada.'},401);
 requireSameOrigin(request);await recheckOperator(op);
 const b=await boundedJson(request,4096),keys=['property_id','property_revision','room_id','request_id','display_name','job_title','name_pending','confirmed'];
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!keys.includes(k))||b.confirmed!==true||![b.property_id,b.room_id,b.request_id].every(v=>typeof v==='string'&&UUID.test(v))||!Number.isSafeInteger(b.property_revision))throw new RequestError('Confira o imóvel, quarto e nome do hóspede.');
 if(typeof b.display_name!=='string'||typeof b.job_title!=='string')throw new RequestError('Confira o nome e a função.');
 if(b.name_pending!==undefined&&typeof b.name_pending!=='boolean')throw new RequestError('Confira o nome pendente.');
 const name=normalized(b.display_name),title=normalized(b.job_title);
 if(!name||name.length>120||title.length>120||/[\u0000-\u001f\u007f]/u.test(name+title))throw new RequestError('Confira o nome e a função.');
 const p=await first('SELECT id,revision,state_code,archived_at FROM properties WHERE id=? AND owner_id=?',b.property_id,op.ownerId);
 if(!p)throw new RequestError('Imóvel não encontrado.',404);
 const prior=await first('SELECT profile_id FROM person_profile_events WHERE owner_id=? AND request_id=?',op.ownerId,b.request_id);
 if(p.archived_at||(!prior&&p.revision!==b.property_revision)||!p.state_code)throw new RequestError('Atualize o imóvel e confirme a UF antes de cadastrar o hóspede.',409);
 const room=await first('SELECT r.id FROM occupancy_rooms r JOIN properties p ON p.id=r.property_id AND p.owner_id=r.owner_id WHERE r.id=? AND r.property_id=? AND r.owner_id=? AND r.state_code IS p.state_code AND r.worksite_id IS p.worksite_id AND r.scope_version=COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)',b.room_id,p.id,op.ownerId);
 if(!room)throw new RequestError('Quarto não encontrado neste imóvel.',404);
 // A repeat must reach the canonical person request, not look like a duplicate.
 
 let witnessed:Record<string,any>[]=[];
 if(!prior){const people=await all("SELECT id,display_name,revision FROM person_profiles WHERE owner_id=? AND state_code=? AND status='active'",op.ownerId,p.state_code);
 witnessed=people;
 if(people.some(x=>normalized(x.display_name).toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw new RequestError('Já existe uma pessoa com esse nome nesta UF. Selecione o cadastro existente ou diferencie o nome após conferir.',409);}
 const f=new FormData();Object.entries({action:'create',request_id:b.request_id,confirmed:'yes',directory:'guest',display_name:name,job_title:title,state_code:p.state_code,name_pending:b.name_pending?'yes':'no'}).forEach(([k,v])=>f.set(k,String(v)));
 const a=operatorGuard(op);
 const guard={sql:a.sql+" AND EXISTS(SELECT 1 FROM properties WHERE id=? AND owner_id=? AND revision=? AND state_code=? AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM occupancy_rooms r JOIN properties p ON p.id=r.property_id AND p.owner_id=r.owner_id WHERE r.id=? AND r.property_id=? AND r.owner_id=? AND r.state_code IS p.state_code AND r.worksite_id IS p.worksite_id AND r.scope_version=COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)) AND (SELECT count(*) FROM person_profiles WHERE owner_id=? AND state_code=? AND status='active')=? AND NOT EXISTS(SELECT 1 FROM person_profiles p WHERE p.owner_id=? AND p.state_code=? AND p.status='active' AND NOT EXISTS(SELECT 1 FROM json_each(?) w WHERE json_extract(w.value,'$.id')=p.id AND json_extract(w.value,'$.revision')=p.revision))",args:[...a.args,p.id,op.ownerId,p.revision,p.state_code,b.room_id,p.id,op.ownerId,op.ownerId,p.state_code,witnessed.length,op.ownerId,p.state_code,JSON.stringify(witnessed.map(p=>({id:p.id,revision:p.revision})))]};
 const result=await savePersonProfile(op,f,{guestCreate:true,guard});
 await recheckOperator(op);
 const person=await first("SELECT id,display_name,job_title,revision FROM person_profiles WHERE id=? AND owner_id=? AND status='active' AND state_code=?",result.id,op.ownerId,p.state_code);
 if(!person)throw new RequestError('O cadastro mudou. Atualize a lista.',409);
 return reply({...result,person});
 }catch(e){return reply({error:e instanceof RequestError?e.message:'Não foi possível confirmar o cadastro. Tente novamente com o mesmo formulário.'},e instanceof RequestError?e.status:503);}}
