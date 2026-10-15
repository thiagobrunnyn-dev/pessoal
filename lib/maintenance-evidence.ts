// Version 1 is an existing record, whose photographs were not divided by phase.
// Version 2 requires three verified files in each phase; never infer legacy phases.
export type EvidencePhoto={phase?:string|null};
export function maintenanceEvidenceComplete(version:number|undefined,photos:EvidencePhoto[]):boolean {
 return Number(version??1)===1 || Number(version)===2&&photos.length===6&&photos.filter(p=>p.phase==='before').length===3&&photos.filter(p=>p.phase==='after').length===3;
}
export function maintenanceCompletion(completion:string,version:number|undefined,photos:EvidencePhoto[]){return completion==='completed'&&!maintenanceEvidenceComplete(version,photos)?'pending':completion;}
export function maintenanceEvidenceSql(alias:string){
 if(!/^[a-z_]+$/.test(alias))throw new Error('Invalid maintenance alias');
 return `(${alias}.evidence_version=1 OR (${alias}.evidence_version=2 AND (SELECT count(*) FROM photos ep WHERE ep.owner_id=${alias}.owner_id AND ep.maintenance_id=${alias}.id)=6 AND (SELECT count(*) FROM photos ep WHERE ep.owner_id=${alias}.owner_id AND ep.maintenance_id=${alias}.id AND ep.phase='before')=3 AND (SELECT count(*) FROM photos ep WHERE ep.owner_id=${alias}.owner_id AND ep.maintenance_id=${alias}.id AND ep.phase='after')=3))`;
}
