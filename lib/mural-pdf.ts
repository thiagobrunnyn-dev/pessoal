import {PDFDocument,PDFDict,PDFArray,PDFName,PDFRef} from 'pdf-lib';
import {RequestError} from './http-security';
export const MURAL_FILE_LIMIT=12*1024*1024;
export const MURAL_FORM_LIMIT=MURAL_FILE_LIMIT+32*1024;
export async function readMuralPdf(value:FormDataEntryValue|null){
 if(!(value instanceof File)||!value.size||value.size>MURAL_FILE_LIMIT)throw new RequestError('Escolha um PDF de até 12 MB.',413);
 if(value.type&&value.type!=='application/pdf'||!value.name.toLowerCase().endsWith('.pdf'))throw new RequestError('Envie um arquivo PDF.',415);
 const bytes=new Uint8Array(await value.arrayBuffer());if(new TextDecoder().decode(bytes.subarray(0,5))!=='%PDF-')throw new RequestError('O arquivo não é um PDF válido.');
 let doc:PDFDocument;try{doc=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true});}catch{throw new RequestError('Não foi possível ler este PDF. Envie um PDF de impressão sem senha.');}
 let pages:number;try{pages=doc.getPageCount();}catch{throw new RequestError('Não foi possível ler as páginas. Envie um PDF de impressão válido.');}if(pages<1||pages>80)throw new RequestError('Use um PDF com 1 a 80 páginas.');
 // Reject active/container features rather than silently rewrite the user's document.
 const blockedKeys=new Set(['JavaScript','JS','AA','OpenAction','AcroForm','AF','EF','EmbeddedFiles','XFA','RichMediaContent','RichMediaSettings']);
 const blockedActions=new Set(['JavaScript','Launch','SubmitForm','ImportData','Rendition','GoToR','Sound','Movie']);
 const seen=new Set<unknown>();let nodes=0;
 const name=(value:PDFName)=>{let result=value.toString().slice(1);for(let pass=0;pass<8;pass++){const next=result.replace(/#([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));if(next===result)return result;result=next;}if(/#[0-9a-f]{2}/i.test(result))throw new RequestError('PDF com nomes internos ambíguos. Exporte uma versão de impressão.');return result;};
 function resolve(value:any){const refs=new Set<string>();while(value instanceof PDFRef){const key=value.toString();if(refs.has(key)||refs.size>64)throw new RequestError('PDF com referências inválidas. Exporte uma versão de impressão.');refs.add(key);value=doc.context.lookup(value);if(!value)throw new RequestError('PDF com referência incompleta.');}return value;}
 function inspect(object:any,depth=0){if(depth>64)throw new RequestError('PDF muito complexo. Exporte uma versão de impressão simplificada.');if(!object||typeof object!=='object'||seen.has(object))return;seen.add(object);if(++nodes>100000)throw new RequestError('PDF muito complexo. Exporte uma versão de impressão simplificada.');
  if(object instanceof PDFDict){for(const [key,raw]of object.entries()){const item=resolve(raw),k=name(key);if(k==='OpenAction'&&!(doc.context.lookup(item) instanceof PDFArray))throw new RequestError('Este PDF contém uma ação automática. Exporte uma versão de impressão.');if(k==='URI'&&typeof (item as any)?.decodeText==='function'&&!/^(https?:|mailto:|tel:)/i.test((item as any).decodeText().trim()))throw new RequestError('Este PDF contém um link não aceito no mural. Exporte uma versão de impressão.');if(blockedKeys.has(k)||k==='Type'&&item instanceof PDFName&&name(item)==='EmbeddedFile'||k==='S'&&item instanceof PDFName&&blockedActions.has(name(item))||k==='Subtype'&&item instanceof PDFName&&['Widget','FileAttachment','RichMedia','Screen','Movie','Sound'].includes(name(item)))throw new RequestError('Este PDF contém recursos interativos não aceitos no mural. Exporte uma versão de impressão.');inspect(item,depth+1);}}
  else if(object instanceof PDFArray)for(const item of object.asArray())inspect(item,depth+1);else if(object.dict instanceof PDFDict)inspect(object.dict,depth+1);
 }
 try{for(const [,object]of doc.context.enumerateIndirectObjects())inspect(resolve(object));inspect(doc.catalog);}catch(e){if(e instanceof RequestError)throw e;throw new RequestError('Não foi possível conferir a estrutura do PDF. Exporte uma versão de impressão.');}
 const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const filename=value.name.replace(/[\u0000-\u001f\u007f]/g,'').replace(/[/\\]/g,'-').slice(0,180)||'mural.pdf';
 return {bytes,size:bytes.length,sha256,pages,filename};
}
export const MURAL_FILE_HEADERS={'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow, noarchive','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'"};
