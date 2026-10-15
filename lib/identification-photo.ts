import {sanitizePhoto} from './photo-privacy';
export class PhotoValidationError extends Error {}
export async function readIdentificationPhoto(form:FormData,required=false){
 const values=form.getAll('identification_photo').filter(v=>v instanceof File&&v.size>0) as File[];
 if(values.length>1)throw new PhotoValidationError('Envie somente uma foto da etiqueta.');
 if(!values.length){if(required)throw new PhotoValidationError('Escolha ou tire uma foto da etiqueta.');return null;}
 const file=values[0];
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4*1024*1024)throw new PhotoValidationError('Use uma foto JPG, PNG ou WebP de até 4 MB.');
 const bytes=await file.arrayBuffer(),s=new Uint8Array(bytes.slice(0,12));
 const valid=(file.type==='image/jpeg'&&s[0]===255&&s[1]===216&&s[2]===255)||(file.type==='image/png'&&s[0]===137&&s[1]===80&&s[2]===78&&s[3]===71)||(file.type==='image/webp'&&String.fromCharCode(...s.slice(0,4))==='RIFF'&&String.fromCharCode(...s.slice(8,12))==='WEBP');
 if(!valid)throw new PhotoValidationError('O arquivo não é uma foto válida. Escolha outra imagem.');
 let safe:Uint8Array;try{safe=sanitizePhoto(bytes,file.type);}catch{throw new PhotoValidationError('Não foi possível preparar esta foto sem metadados. Use JPG, PNG ou WebP estática.');}return {bytes:safe,type:file.type,size:safe.length};
}
export function equipmentForClient(row:Record<string,unknown>){const {identification_photo_key,...rest}=row;return {...rest,has_identification_photo:!!identification_photo_key};}
