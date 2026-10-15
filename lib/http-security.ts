export class RequestError extends Error{constructor(message:string,public status=400){super(message);}}
export function requireSameOrigin(request:Request){if(request.headers.get('origin')!==new URL(request.url).origin)throw new RequestError('Origem inválida.',403);}
async function readBoundedBody(request:Request,max:number){
 if(Number(request.headers.get('content-length')||0)>max)throw new RequestError('Arquivo ou solicitação acima do limite.',413);
 const reader=request.body?.getReader();if(!reader)return new Uint8Array();let size=0;const chunks:Uint8Array[]=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();throw new RequestError('Arquivo ou solicitação acima do limite.',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}return body;
}
export async function boundedJson(request:Request,max=2048){if(!request.headers.get('content-type')?.startsWith('application/json'))throw new RequestError('Formato inválido.',415);const bytes=await readBoundedBody(request,max);try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new RequestError('Solicitação inválida.');}}
export async function boundedForm(request:Request,max=13*1024*1024){const type=request.headers.get('content-type')||'';if(!type.startsWith('multipart/form-data;'))throw new RequestError('Formato inválido.',415);const bytes=await readBoundedBody(request,max);try{return await new Response(bytes.buffer as ArrayBuffer,{headers:{'Content-Type':type}}).formData();}catch{throw new RequestError('Formulário inválido.');}}
