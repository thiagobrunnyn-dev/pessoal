// The trusted runtime supplies the owner subject and tenant namespace.
export async function access(db,userId,mode,ownerSubject){
 if(typeof ownerSubject!=='string'||!ownerSubject.trim()||ownerSubject==='REPLACE_WITH_VERIFIED_OWNER_SUBJECT')return null;
 if(userId===ownerSubject)return {role:'owner',tenant:ownerSubject,userId};
 if(!db)return null;
 const member=await db.prepare('SELECT driver_id,display_name FROM transport_memberships WHERE subject=? AND tenant=? AND mode=? AND enabled=1').bind(userId,ownerSubject,mode).first();
 return member?{role:'driver',tenant:ownerSubject,userId,driverId:member.driver_id,name:member.display_name}:null;
}
