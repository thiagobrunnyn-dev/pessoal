import {AsyncLocalStorage} from 'node:async_hooks';
import {RequestError} from './http-security';
// This restriction supplements the app's existing owner, operator and bearer authorization.
// The platform supplies these identity headers; no email or region is accepted from forms.
export const REGIONAL_EMAIL='manutencao@example.invalid';
export const REGION_POLICY={states:['PA'],allWorksites:true} as const;
type RegionalContext={regional:boolean;permitted:boolean;epoch:number;memberId:string|null;revision:number};
const context=new AsyncLocalStorage<RegionalContext>();
export const isRegionalRequest=()=>context.getStore()?.regional===true;
export function regionalWriteGuard(){const c=context.getStore();if(!c?.regional)return {sql:'1',args:[] as unknown[]};return {sql:c.permitted?'EXISTS(SELECT 1 FROM regional_epoch WHERE id=1 AND version=?)':'0',args:c.permitted?[c.epoch]:[]};}
export function requireGlobalCatalog(){if(isRegionalRequest())throw new RequestError('Este cadastro é administrado pela gestão com acesso geral.',403);}
export function forbidRegionalMove(original:string,next:string){if(isRegionalRequest()&&original!==next)throw new RequestError('A transferência de imóvel deve ser feita pela gestão com acesso geral.',403);}
export async function runWithRegionalAccess<T>(request:Request,db:D1Database,run:()=>T):Promise<Awaited<T>>{
 const uid=request.headers.get('oai-authenticated-user-id'),email=(request.headers.get('oai-authenticated-user-email')||'').toLowerCase();
 let member:any=null;
 // Email only selects the restrictive path. Operational access still requires the bound approved ID.
 if(uid&&uid!=='CONFIGURE_VERIFIED_SITE_OWNER_ID')member=await db.prepare("SELECT user_id,email,status,role,revision FROM app_members WHERE user_id=? AND (email=? OR role='maintenance_lead')").bind(uid,REGIONAL_EMAIL).first();
 const regional=email===REGIONAL_EMAIL||member?.email===REGIONAL_EMAIL;
 if(!regional)return await context.run({regional:false,permitted:false,epoch:-1,memberId:null,revision:-1},run);
 const permitted=!!(member&&member.email===REGIONAL_EMAIL&&member.role==='maintenance_lead'&&member.status==='active');
 const epoch=permitted?await db.prepare('SELECT version FROM regional_epoch WHERE id=1').first<{version:number}>():null;
 const c={regional:true,permitted:permitted&&!!epoch,epoch:epoch?.version??-1,memberId:member?.user_id??null,revision:member?.revision??-1};
 return await context.run(c,async()=>{
  // A signed-in manager uses the management forms. Bearer write routes must never bypass live scope guards.
  const p=new URL(request.url).pathname;
  if(request.method!=='GET'&&request.method!=='HEAD'&&(p.startsWith('/api/visits/')||p==='/api/cleaning/visit'))return Response.json({error:'Use a área de gestão da sua conta para registrar o serviço.'},{status:403,headers:{'Cache-Control':'private, no-store'}}) as Awaited<T>;
  return await run();
 });
}
export function ensureRegionalContext(email:string){if(email===REGIONAL_EMAIL&&!isRegionalRequest())throw new RequestError('Não foi possível validar o escopo do acesso. Atualize a página.',403);}
export function scopedSelect(sql:string):string{
 const c=context.getStore();if(!c?.regional)return sql;
 const syntax=sql.replace(/'(?:''|[^'])*'/g,"''");
 const sources=[...syntax.matchAll(/\b(?:FROM|JOIN)\s+([A-Za-z_]\w*)/gi)].map(m=>m[1].toLowerCase());
 const known=new Set(['properties','equipment','maintenance','photos','maintenance_schedule','cleaning_locations','cleaning_records','cleaning_photos','cleaning_page_opens','clients','cost_centers','housing_handovers','work_orders','work_order_events','work_order_photos','property_geolocations','record_geolocations','equipment_changes','correction_events','operation_plans','service_reviews','operation_events','visit_grants','visit_sessions','visit_rate_limits','cleaning_grants','cleaning_sessions','app_members','regional_epoch','regional_snapshots','regional_assignments','archive_events','person_profiles','person_number_counters','person_photo_assets','guest_document_assets','person_profile_events','service_attributions','execution_acceptances','property_front_photo_assets','mobilizations','mobilization_events','mobilization_photos','property_furniture','property_furniture_events','property_furniture_photos','property_inspections','property_inspection_events','property_inspection_photos','property_inspection_signatures','property_creation_requests','vehicles','vehicle_events','occupancy_property_scopes','occupancy_rooms','occupancy_stays','occupancy_events','occupancy_imports','mural_documents','mural_document_versions','mural_document_events','equipment_public_events','service_providers','service_provider_events','property_services','property_service_events','property_service_files','property_service_schedule','guest_channels','guest_channel_events','guest_channel_sessions','guest_submissions','guest_submission_events','guest_submission_photos','request_form_sessions','request_intakes','request_intake_events','request_intake_files','json_each']);
 if(!/^\s*SELECT\b/i.test(syntax)||/["`\[\]]|\bmain\s*\.|;|--|\/\*/i.test(syntax)||sources.some(t=>!known.has(t)))throw new RequestError('Consulta indisponível para este escopo.',403);
 return regionCTEs(c.permitted,true)+sql;
}
// CTEs shadow only known application tables. The immutable record snapshot and current
// property must both be in scope, so moving a parent cannot disclose another state's history.
export function scopedReadArgs(args:unknown[]){const c=context.getStore();return c?.regional?[c.memberId??'',c.revision,...args]:args;}
export function regionCTEs(permitted:boolean,liveMember=false){
 const state=permitted?"state_code='PA'"+(liveMember?' AND EXISTS(SELECT 1 FROM __regional_auth)':''):"0";
 const list:string[]=liveMember?["__regional_auth AS (SELECT 1 FROM main.app_members WHERE user_id=? AND revision=? AND status='active' AND email='manutencao@example.invalid' AND role='maintenance_lead')"]:[];const add=(name:string,where:string,cols='t.*')=>list.push(`${name} AS (SELECT t.rowid AS rowid,${cols} FROM main.${name} t WHERE ${where})`);
 const snap=(type:string,id='t.id')=>`EXISTS(SELECT 1 FROM regional_snapshots rs WHERE rs.entity_type='${type}' AND rs.entity_id=${id})`;
 add('regional_snapshots',state+" AND (previous_state_code IS NULL OR previous_state_code='PA')");
 add('properties',state);
 add('occupancy_imports',"t.actor_user_id IN(SELECT user_id FROM main.app_members WHERE email='manutencao@example.invalid' AND role='maintenance_lead' AND status='active')"+(liveMember?' AND EXISTS(SELECT 1 FROM __regional_auth)':''));
 add('property_creation_requests',"t.state_code='PA' AND EXISTS(SELECT 1 FROM properties p WHERE p.id=t.property_id AND p.owner_id=t.owner_id)");
 add('property_front_photo_assets',"t.state_code='PA' AND t.property_id IN(SELECT id FROM properties)");
 add('equipment','t.property_id IN(SELECT id FROM properties)',`t.id,t.owner_id,t.public_history_enabled,t.public_history_revision,t.archived_at,t.archive_event_id,t.property_id,t.name,t.location,t.brand_model,t.serial,CASE WHEN ${snap('identification')} THEN t.identification_photo_key END identification_photo_key,CASE WHEN ${snap('identification')} THEN t.identification_photo_type END identification_photo_type,CASE WHEN ${snap('identification')} THEN t.identification_photo_size END identification_photo_size,CASE WHEN ${snap('identification')} THEN t.identification_photo_created_at END identification_photo_created_at,CASE WHEN ${snap('baseline')} THEN t.baseline_date END baseline_date,t.checklist,t.revision,t.last_change_id,t.created_at`);
 add('equipment_public_events','0');
 add('cleaning_locations','t.property_id IN(SELECT id FROM properties)');
 add('maintenance',"t.equipment_id IN(SELECT id FROM equipment) AND "+snap('maintenance'));
 add('photos','t.maintenance_id IN(SELECT id FROM maintenance)');
 add('cleaning_records',"t.location_id IN(SELECT id FROM cleaning_locations) AND "+snap('cleaning_record'));
 add('cleaning_photos','t.record_id IN(SELECT id FROM cleaning_records)');
 add('housing_handovers',"t.property_id IN(SELECT id FROM properties) AND "+snap('handover'));
 add('mobilizations',"t.state_code='PA' AND t.property_id IN(SELECT id FROM properties) AND "+snap('mobilization'));
 add('mobilization_events',"t.mobilization_id IN(SELECT id FROM mobilizations) AND "+snap('mobilization_event'));
 add('mobilization_photos','t.mobilization_id IN(SELECT id FROM mobilizations) AND t.event_id IN(SELECT id FROM mobilization_events)');
 add('property_furniture',"t.state_code='PA' AND EXISTS(SELECT 1 FROM properties p WHERE p.id=t.property_id AND p.owner_id=t.owner_id AND p.state_code IS t.state_code AND p.worksite_id IS t.worksite_id)");
 add('property_furniture_events',"t.furniture_id IN(SELECT id FROM property_furniture) AND t.state_code='PA'");
 add('property_furniture_photos','t.furniture_id IN(SELECT id FROM property_furniture) AND t.event_id IN(SELECT id FROM property_furniture_events)');
 add('property_inspections',"t.state_code='PA' AND t.property_id IN(SELECT id FROM properties) AND "+snap('property_inspection'));
 add('property_inspection_events',"t.inspection_id IN(SELECT id FROM property_inspections) AND t.property_id IN(SELECT id FROM properties) AND "+snap('property_inspection_event'));
 add('property_inspection_photos','t.inspection_id IN(SELECT id FROM property_inspections) AND t.event_id IN(SELECT id FROM property_inspection_events) AND t.property_id IN(SELECT id FROM properties)');
 add('property_inspection_signatures','t.inspection_id IN(SELECT id FROM property_inspections) AND t.event_id IN(SELECT id FROM property_inspection_events) AND t.property_id IN(SELECT id FROM properties)');
 // Occupancy uses a monotonic property scope generation. A PA -> MG -> PA move never
 // makes an earlier generation visible again, including on direct event/stay reads.
 add('occupancy_property_scopes','t.property_id IN(SELECT id FROM properties)');
 const occupancyScope="t.state_code='PA' AND EXISTS(SELECT 1 FROM properties p WHERE p.id=t.property_id AND p.owner_id=t.owner_id AND p.state_code IS t.state_code AND p.worksite_id IS t.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=t.scope_version)";
 const muralScope="t.property_id IS NOT NULL AND t.state_code='PA' AND EXISTS(SELECT 1 FROM properties p WHERE p.id=t.property_id AND p.owner_id=t.owner_id AND p.state_code IS t.state_code AND p.worksite_id IS t.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=t.scope_version)";
 add('guest_channels',muralScope,"t.id,t.owner_id,t.property_id,NULL token_hash,NULL token_value,t.enabled,t.revision,t.state_code,t.worksite_id,t.scope_version,t.last_event_id,t.created_at,t.updated_at");
 add('guest_channel_events','0');add('guest_channel_sessions','0');
 add('guest_submissions',muralScope);
 add('guest_submission_events',muralScope+' AND t.submission_id IN(SELECT id FROM guest_submissions)');
 add('guest_submission_photos','t.submission_id IN(SELECT id FROM guest_submissions)');
 add('request_form_sessions','0');
 add('request_intakes',"t.assigned_at IS NOT NULL AND t.state_code='PA' AND EXISTS(SELECT 1 FROM __regional_auth) AND (t.property_id IS NULL OR EXISTS(SELECT 1 FROM properties p WHERE p.id=t.property_id AND p.owner_id=t.owner_id AND p.state_code IS t.state_code AND p.worksite_id IS t.worksite_id AND COALESCE((SELECT version FROM occupancy_property_scopes WHERE property_id=p.id),0)=t.scope_version)) AND (t.client_id IS NULL OR t.client_id IN(SELECT id FROM clients)) AND (t.cost_center_id IS NULL OR t.cost_center_id IN(SELECT id FROM cost_centers))".replace(' AND EXISTS(SELECT 1 FROM __regional_auth)',liveMember?' AND EXISTS(SELECT 1 FROM __regional_auth)':permitted?'':' AND 0'));
 add('request_intake_events',"t.state_code='PA' AND t.intake_id IN(SELECT id FROM request_intakes)");
 add('request_intake_files','t.intake_id IN(SELECT id FROM request_intakes)');
 add('service_providers',"EXISTS(SELECT 1 FROM json_each(CASE WHEN json_valid(t.scope_states) THEN t.scope_states ELSE '[]' END) ps WHERE ps.value='PA')"+(liveMember?' AND EXISTS(SELECT 1 FROM __regional_auth)':''));
 add('service_provider_events','0');
 add('property_services',muralScope);
 add('property_service_events',muralScope+' AND t.record_id IN(SELECT id FROM property_services)');
 add('property_service_files',muralScope+' AND t.record_id IN(SELECT id FROM property_services)');
 add('property_service_schedule',muralScope+' AND t.record_id IN(SELECT id FROM property_services)');
 add('mural_documents',muralScope);
 add('mural_document_versions',muralScope+' AND t.document_id IN(SELECT id FROM mural_documents)');
 add('mural_document_events',muralScope+' AND t.document_id IN(SELECT id FROM mural_documents)');
 add('occupancy_rooms',occupancyScope);
 add('occupancy_stays',occupancyScope+' AND t.room_id IN(SELECT id FROM occupancy_rooms)',"t.id,t.owner_id,t.property_id,t.room_id,t.state_code,t.worksite_id,t.scope_version,t.room_name,t.slot_number,t.person_profile_id,t.person_name,t.person_title,t.shift,t.entry_on,t.exit_on,t.revision,t.last_event_id,t.request_id,t.request_fingerprint,t.actor_user_id,t.actor_name,t.created_at,t.updated_at,t.planned_exit_on,t.assignment_captured_at,CASE WHEN (t.client_id IS NULL OR t.client_id IN(SELECT id FROM clients)) AND (t.cost_center_id IS NULL OR t.cost_center_id IN(SELECT id FROM cost_centers)) THEN t.client_id END client_id,CASE WHEN (t.client_id IS NULL OR t.client_id IN(SELECT id FROM clients)) AND (t.cost_center_id IS NULL OR t.cost_center_id IN(SELECT id FROM cost_centers)) THEN t.client_name END client_name,CASE WHEN (t.client_id IS NULL OR t.client_id IN(SELECT id FROM clients)) AND (t.cost_center_id IS NULL OR t.cost_center_id IN(SELECT id FROM cost_centers)) THEN t.cost_center_id END cost_center_id,CASE WHEN (t.client_id IS NULL OR t.client_id IN(SELECT id FROM clients)) AND (t.cost_center_id IS NULL OR t.cost_center_id IN(SELECT id FROM cost_centers)) THEN t.cost_center_name END cost_center_name,CASE WHEN (t.client_id IS NULL OR t.client_id IN(SELECT id FROM clients)) AND (t.cost_center_id IS NULL OR t.cost_center_id IN(SELECT id FROM cost_centers)) THEN 0 ELSE 1 END assignment_unavailable");
 add('occupancy_events',occupancyScope+' AND t.room_id IN(SELECT id FROM occupancy_rooms) AND (t.stay_id IS NULL OR t.stay_id IN(SELECT id FROM occupancy_stays))',"t.id,t.owner_id,t.property_id,t.room_id,t.stay_id,t.state_code,t.worksite_id,t.scope_version,t.action,t.revision,t.actor_user_id,t.actor_name,t.request_id,t.request_fingerprint,t.created_at,json_remove(t.before_snapshot,'$.client_id','$.client_name','$.cost_center_id','$.cost_center_name') before_snapshot,json_remove(t.after_snapshot,'$.client_id','$.client_name','$.cost_center_id','$.cost_center_name') after_snapshot");
 add('work_orders',"t.property_id IN(SELECT id FROM properties) AND "+snap('work_order'));
 add('work_order_events',"t.work_order_id IN(SELECT id FROM work_orders) AND "+snap('work_order_event'));
 add('work_order_photos','t.work_order_id IN(SELECT id FROM work_orders) AND t.event_id IN(SELECT id FROM work_order_events)');
 add('maintenance_schedule',"t.equipment_id IN(SELECT id FROM equipment) AND (t.cycle_id IN(SELECT id FROM maintenance WHERE is_test=0 AND completion_status='completed') OR EXISTS(SELECT 1 FROM equipment e WHERE e.id=t.equipment_id AND e.baseline_date IS NOT NULL AND t.cycle_id='baseline:'||e.id||':'||e.baseline_date))");
 add('property_geolocations',"t.property_id IN(SELECT id FROM properties) AND "+snap('property_point','t.property_id'));
 add('record_geolocations',"(t.record_type='maintenance' AND t.record_id IN(SELECT id FROM maintenance)) OR (t.record_type='cleaning' AND t.record_id IN(SELECT id FROM cleaning_records))");
 add('cleaning_page_opens',"t.location_id IN(SELECT id FROM cleaning_locations) AND "+snap('cleaning_open'));
 add('cost_centers','t.id IN(SELECT worksite_id FROM properties WHERE worksite_id IS NOT NULL) OR t.id IN(SELECT cost_center_id FROM housing_handovers) OR t.id IN(SELECT cost_center_id FROM work_orders) OR t.id IN(SELECT cost_center_id FROM mobilizations)');
 add('clients','t.id IN(SELECT client_id FROM cost_centers) OR t.id IN(SELECT client_id FROM housing_handovers) OR t.id IN(SELECT client_id FROM work_orders) OR t.id IN(SELECT client_id FROM mobilizations)');
 add('equipment_changes',"t.equipment_id IN(SELECT id FROM equipment) AND json_extract(t.before_snapshot,'$.baseline_date') IS NULL AND json_extract(t.after_snapshot,'$.baseline_date') IS NULL AND "+snap('equipment_change'));
 // Corrections can contain arbitrary earlier snapshots. They remain available to global managers.
 add('correction_events','0');
 const current="(t.item_type='air' AND t.item_id IN(SELECT id FROM equipment)) OR (t.item_type='cleaning' AND t.item_id IN(SELECT id FROM cleaning_locations)) OR (t.item_type IN('work_order','order') AND t.item_id IN(SELECT id FROM work_orders)) OR (t.item_type='maintenance' AND t.item_id IN(SELECT id FROM maintenance)) OR (t.item_type='cleaning_record' AND t.item_id IN(SELECT id FROM cleaning_records))";
 add('operation_plans',`(${current}) AND ${snap('operation_plan')}`);add('service_reviews',`(${current}) AND ${snap('service_review')}`);
 add('operation_events',`((t.kind='plan' AND t.entity_id IN(SELECT id FROM operation_plans)) OR (t.kind='review' AND t.entity_id IN(SELECT id FROM service_reviews))) AND ${snap('operation_event')}`);
 add('visit_grants','t.equipment_id IN(SELECT id FROM equipment)');add('visit_sessions','t.grant_id IN(SELECT id FROM visit_grants)');
 add('cleaning_grants','t.location_id IN(SELECT id FROM cleaning_locations)');add('cleaning_sessions','t.grant_id IN(SELECT id FROM cleaning_grants)');
 add('vehicles',state);
 add('vehicle_events',"t.state_code='PA' AND t.vehicle_id IN(SELECT id FROM vehicles) AND (json_type(t.before_snapshot)='null' OR t.previous_state_code='PA')");
 add('person_profiles',state);add('person_number_counters','0');
 add('service_attributions',"((t.entity_type='maintenance' AND t.entity_id IN(SELECT id FROM maintenance)) OR (t.entity_type='cleaning_record' AND t.entity_id IN(SELECT id FROM cleaning_records)) OR (t.entity_type='work_order' AND t.entity_id IN(SELECT id FROM work_orders)) OR (t.entity_type='handover' AND t.entity_id IN(SELECT id FROM housing_handovers))) AND "+snap('service_attribution'));
 add('execution_acceptances','t.attribution_id IN(SELECT id FROM service_attributions)');
 add('guest_document_assets',"t.state_code='PA' AND EXISTS(SELECT 1 FROM person_profiles p WHERE p.id=t.profile_id AND p.owner_id=t.owner_id AND p.state_code='PA' AND p.directory='guest')");
 add('person_photo_assets',`t.profile_id IN(SELECT id FROM person_profiles) OR t.id IN(SELECT executor_photo_asset_id FROM service_attributions) OR t.id IN(SELECT actor_photo_asset_id FROM service_attributions) OR t.id IN(SELECT json_extract(actor_snapshot,'$.photo_asset_id') FROM service_reviews WHERE actor_snapshot IS NOT NULL)`);
 add('person_profile_events',"t.profile_id IN(SELECT id FROM person_profiles) AND json_extract(t.after_snapshot,'$.state_code')='PA' AND (json_type(t.before_snapshot)='null' OR json_extract(t.before_snapshot,'$.state_code')='PA')");
 add('regional_assignments','0');
 add('archive_events',"((t.entity_type='property' AND t.entity_id IN(SELECT id FROM properties)) OR (t.entity_type='equipment' AND t.entity_id IN(SELECT id FROM equipment)) OR (t.entity_type='cleaning_location' AND t.entity_id IN(SELECT id FROM cleaning_locations))) AND "+snap('archive_event'));
 return 'WITH '+list.join(',')+' ';
}

// Call only AFTER the target was read through the scoped facade. This returns no audit content.
export async function regionalCorrectionReplay(db:D1Database,owner:string,entity:string,id:string,requestId:string){
 const c=context.getStore();if(!c?.regional||!c.permitted)return null;
 return db.prepare("SELECT id,request_fingerprint FROM correction_events WHERE owner_id=? AND entity_type=? AND entity_id=? AND request_id=? AND actor_user_id=? AND EXISTS(SELECT 1 FROM app_members WHERE user_id=? AND revision=? AND email=? AND role='maintenance_lead' AND status='active') AND EXISTS(SELECT 1 FROM regional_epoch WHERE id=1 AND version=?)").bind(owner,entity,id,requestId,c.memberId,c.memberId,c.revision,REGIONAL_EMAIL,c.epoch).first();
}
